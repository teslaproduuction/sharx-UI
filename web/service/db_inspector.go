package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/logger"
)

// dbInspectorAllowedTables is an optional allowlist.
// When empty, all tables in the public schema are accessible.
// Populate this list to restrict which tables the inspector may touch.
var dbInspectorAllowedTables = []string{}

// DbInspectorService provides introspection and CRUD access to the application
// database via the DB Inspector UI. It deliberately avoids raw SQL on the
// frontend: all interactions go through typed, validated Go methods.
type DbInspectorService struct{}

// ─── Types ────────────────────────────────────────────────────────────────────

// FieldType mirrors the frontend type system.
type FieldType string

const (
	FieldTypeString  FieldType = "string"
	FieldTypeNumber  FieldType = "number"
	FieldTypeBoolean FieldType = "boolean"
	FieldTypeDate    FieldType = "date"
	FieldTypeJSON    FieldType = "json"
	FieldTypeUnknown FieldType = "unknown"
)

// ColumnInfo describes a single column's metadata.
type ColumnInfo struct {
	Name       string    `json:"name"`
	Type       FieldType `json:"type"`
	Nullable   bool      `json:"nullable"`
	PrimaryKey bool      `json:"primaryKey"`
}

// TableSchema describes a table and its columns.
type TableSchema struct {
	Name     string       `json:"name"`
	Columns  []ColumnInfo `json:"columns"`
	RowCount *int64       `json:"rowCount,omitempty"`
}

// TableDataResponse is the paginated data payload for the frontend.
type TableDataResponse struct {
	Rows     []map[string]interface{} `json:"rows"`
	Total    int64                    `json:"total"`
	Page     int                      `json:"page"`
	PageSize int                      `json:"pageSize"`
}

// TableQuery carries the pagination / sort / search parameters from the client.
type TableQuery struct {
	Page       int
	PageSize   int
	SortColumn string
	SortDir    string // "asc" or "desc"
	Search     string
}

// ─── Allowlist helper ─────────────────────────────────────────────────────────

func (s *DbInspectorService) isTableAllowed(name string) bool {
	if len(dbInspectorAllowedTables) == 0 {
		return true
	}
	for _, t := range dbInspectorAllowedTables {
		if t == name {
			return true
		}
	}
	return false
}

// safeIdentifier returns the quoted identifier for a PostgreSQL table/column name.
// It rejects names that contain characters outside [a-zA-Z0-9_] to prevent injection.
func safeIdentifier(name string) (string, error) {
	for _, ch := range name {
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') || ch == '_') {
			return "", fmt.Errorf("invalid identifier: %q", name)
		}
	}
	return `"` + name + `"`, nil
}

// ─── ListTables ───────────────────────────────────────────────────────────────

// ListTables returns all user tables in the public schema together with an
// estimated row count (from pg_stat_user_tables — fast, not exact).
func (s *DbInspectorService) ListTables() ([]TableSchema, error) {
	db := database.GetDB()

	type tableRow struct {
		TableName string `gorm:"column:table_name"`
		RowCount  int64  `gorm:"column:row_count"`
	}

	var rows []tableRow
	err := db.Raw(`
		SELECT
			t.table_name,
			COALESCE(s.n_live_tup, 0) AS row_count
		FROM information_schema.tables t
		LEFT JOIN pg_stat_user_tables s ON s.relname = t.table_name
		WHERE t.table_schema = 'public'
		  AND t.table_type  = 'BASE TABLE'
		ORDER BY t.table_name
	`).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("list tables: %w", err)
	}

	result := make([]TableSchema, 0, len(rows))
	for _, r := range rows {
		if !s.isTableAllowed(r.TableName) {
			continue
		}
		rc := r.RowCount
		result = append(result, TableSchema{
			Name:     r.TableName,
			RowCount: &rc,
		})
	}
	return result, nil
}

// ─── GetTableSchema ───────────────────────────────────────────────────────────

// GetTableSchema returns the column list with type information for the given table.
func (s *DbInspectorService) GetTableSchema(tableName string) (*TableSchema, error) {
	if !s.isTableAllowed(tableName) {
		return nil, fmt.Errorf("table %q is not accessible", tableName)
	}

	db := database.GetDB()

	type colRow struct {
		ColumnName string `gorm:"column:column_name"`
		DataType   string `gorm:"column:data_type"`
		UDTName    string `gorm:"column:udt_name"`
		IsNullable string `gorm:"column:is_nullable"`
	}
	var cols []colRow
	err := db.Raw(`
		SELECT
			column_name,
			data_type,
			udt_name,
			is_nullable
		FROM information_schema.columns
		WHERE table_schema = 'public'
		  AND table_name   = ?
		ORDER BY ordinal_position
	`, tableName).Scan(&cols).Error
	if err != nil {
		return nil, fmt.Errorf("get schema for %q: %w", tableName, err)
	}
	if len(cols) == 0 {
		return nil, fmt.Errorf("table %q not found", tableName)
	}

	// Determine primary key columns via pg catalog.
	pkCols := map[string]bool{}
	type pkRow struct {
		ColumnName string `gorm:"column:column_name"`
	}
	var pks []pkRow
	_ = db.Raw(`
		SELECT kcu.column_name
		FROM information_schema.table_constraints tc
		JOIN information_schema.key_column_usage kcu
		  ON tc.constraint_name = kcu.constraint_name
		 AND tc.table_schema    = kcu.table_schema
		WHERE tc.constraint_type = 'PRIMARY KEY'
		  AND tc.table_schema    = 'public'
		  AND tc.table_name      = ?
	`, tableName).Scan(&pks).Error
	for _, pk := range pks {
		pkCols[pk.ColumnName] = true
	}

	columns := make([]ColumnInfo, 0, len(cols))
	for _, c := range cols {
		columns = append(columns, ColumnInfo{
			Name:       c.ColumnName,
			Type:       pgTypeToFieldType(c.DataType, c.UDTName),
			Nullable:   c.IsNullable == "YES",
			PrimaryKey: pkCols[c.ColumnName],
		})
	}

	schema := &TableSchema{
		Name:    tableName,
		Columns: columns,
	}
	return schema, nil
}

// pgTypeToFieldType maps a PostgreSQL data_type / udt_name to our FieldType.
func pgTypeToFieldType(dataType, udtName string) FieldType {
	dt := strings.ToLower(dataType)
	udt := strings.ToLower(udtName)

	switch {
	case dt == "boolean":
		return FieldTypeBoolean
	case strings.Contains(dt, "int") || dt == "numeric" || dt == "real" ||
		dt == "double precision" || dt == "decimal" || dt == "money" ||
		strings.HasPrefix(udt, "int") || udt == "numeric" || udt == "float4" || udt == "float8":
		return FieldTypeNumber
	case dt == "date" || strings.Contains(dt, "timestamp") || dt == "time" ||
		strings.HasPrefix(udt, "timestamp") || udt == "date":
		return FieldTypeDate
	case dt == "json" || dt == "jsonb" || udt == "json" || udt == "jsonb":
		return FieldTypeJSON
	case strings.Contains(dt, "char") || dt == "text" || dt == "name" ||
		dt == "uuid" || dt == "cidr" || dt == "inet" || dt == "macaddr" ||
		strings.HasPrefix(udt, "varchar") || udt == "text" || udt == "uuid":
		return FieldTypeString
	default:
		return FieldTypeUnknown
	}
}

// ─── GetTableData ─────────────────────────────────────────────────────────────

// GetTableData returns a paginated, optionally sorted and searched slice of rows.
func (s *DbInspectorService) GetTableData(tableName string, q TableQuery) (*TableDataResponse, error) {
	if !s.isTableAllowed(tableName) {
		return nil, fmt.Errorf("table %q is not accessible", tableName)
	}
	tableIdent, err := safeIdentifier(tableName)
	if err != nil {
		return nil, err
	}

	db := database.GetDB()

	// Build WHERE clause for search (applied to all text-like columns).
	whereClause := ""
	whereArgs := []interface{}{}
	if q.Search != "" {
		schema, schErr := s.GetTableSchema(tableName)
		if schErr == nil {
			var conditions []string
			for _, col := range schema.Columns {
				if col.Type == FieldTypeString || col.Type == FieldTypeUnknown {
					colIdent, idErr := safeIdentifier(col.Name)
					if idErr == nil {
						conditions = append(conditions, fmt.Sprintf("%s ILIKE ?", colIdent))
						whereArgs = append(whereArgs, "%"+q.Search+"%")
					}
				}
			}
			if len(conditions) > 0 {
				whereClause = "WHERE " + strings.Join(conditions, " OR ")
			}
		}
	}

	// Count total rows.
	var total int64
	countSQL := fmt.Sprintf(`SELECT COUNT(*) FROM %s %s`, tableIdent, whereClause)
	if err := db.Raw(countSQL, whereArgs...).Scan(&total).Error; err != nil {
		logger.Warningf("db_inspector: count %s: %v", tableName, err)
		return nil, fmt.Errorf("count rows: %w", err)
	}

	// Build ORDER BY.
	orderClause := ""
	if q.SortColumn != "" {
		sortIdent, sortErr := safeIdentifier(q.SortColumn)
		if sortErr == nil {
			dir := "ASC"
			if strings.ToUpper(q.SortDir) == "DESC" {
				dir = "DESC"
			}
			orderClause = fmt.Sprintf("ORDER BY %s %s", sortIdent, dir)
		}
	}

	// Clamp pagination.
	if q.PageSize <= 0 {
		q.PageSize = 25
	}
	if q.PageSize > 500 {
		q.PageSize = 500
	}
	if q.Page <= 0 {
		q.Page = 1
	}
	offset := (q.Page - 1) * q.PageSize

	selectSQL := fmt.Sprintf(
		`SELECT * FROM %s %s %s LIMIT %d OFFSET %d`,
		tableIdent, whereClause, orderClause, q.PageSize, offset,
	)

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql.DB: %w", err)
	}

	sqlRows, err := sqlDB.Query(selectSQL, whereArgs...)
	if err != nil {
		return nil, fmt.Errorf("query rows: %w", err)
	}
	defer func() { _ = sqlRows.Close() }()

	columnNames, err := sqlRows.Columns()
	if err != nil {
		return nil, fmt.Errorf("get columns: %w", err)
	}

	var result []map[string]interface{}
	for sqlRows.Next() {
		values := make([]interface{}, len(columnNames))
		valuePtrs := make([]interface{}, len(columnNames))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if scanErr := sqlRows.Scan(valuePtrs...); scanErr != nil {
			return nil, fmt.Errorf("scan row: %w", scanErr)
		}
		row := make(map[string]interface{}, len(columnNames))
		for i, name := range columnNames {
			row[name] = normalizeValue(values[i])
		}
		result = append(result, row)
	}
	if err := sqlRows.Err(); err != nil {
		return nil, fmt.Errorf("rows error: %w", err)
	}

	if result == nil {
		result = []map[string]interface{}{}
	}

	return &TableDataResponse{
		Rows:     result,
		Total:    total,
		Page:     q.Page,
		PageSize: q.PageSize,
	}, nil
}

// normalizeValue converts driver values to JSON-friendly Go types.
func normalizeValue(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case []byte:
		// Could be JSONB, text, or binary. Try JSON first; fallback to string.
		s := string(val)
		if strings.HasPrefix(s, "{") || strings.HasPrefix(s, "[") {
			var js interface{}
			if json.Unmarshal(val, &js) == nil {
				return js
			}
		}
		return s
	case time.Time:
		return val.UTC().Format(time.RFC3339)
	default:
		return val
	}
}

// ─── CreateRow ────────────────────────────────────────────────────────────────

// CreateRow inserts a new row into the named table using parameterised SQL.
func (s *DbInspectorService) CreateRow(tableName string, data map[string]interface{}) error {
	if !s.isTableAllowed(tableName) {
		return fmt.Errorf("table %q is not accessible", tableName)
	}
	tableIdent, err := safeIdentifier(tableName)
	if err != nil {
		return err
	}
	if len(data) == 0 {
		return fmt.Errorf("no data provided")
	}

	schema, err := s.GetTableSchema(tableName)
	if err != nil {
		return err
	}
	// Remove PK columns — let the DB auto-generate them.
	for _, col := range schema.Columns {
		if col.PrimaryKey {
			delete(data, col.Name)
		}
	}
	if len(data) == 0 {
		return fmt.Errorf("no writable columns provided")
	}

	colIdents := make([]string, 0, len(data))
	placeholders := make([]string, 0, len(data))
	args := make([]interface{}, 0, len(data))

	i := 1
	for colName, val := range data {
		ci, ciErr := safeIdentifier(colName)
		if ciErr != nil {
			return ciErr
		}
		colIdents = append(colIdents, ci)
		placeholders = append(placeholders, fmt.Sprintf("$%d", i))
		args = append(args, coerceArg(val))
		i++
	}

	sql := fmt.Sprintf(
		`INSERT INTO %s (%s) VALUES (%s)`,
		tableIdent,
		strings.Join(colIdents, ", "),
		strings.Join(placeholders, ", "),
	)

	db := database.GetDB()
	return db.Exec(sql, args...).Error
}

// ─── UpdateRow ────────────────────────────────────────────────────────────────

// UpdateRow updates the row identified by pkColumn = pkValue in the named table.
func (s *DbInspectorService) UpdateRow(
	tableName, pkColumn string, pkValue interface{},
	data map[string]interface{},
) error {
	if !s.isTableAllowed(tableName) {
		return fmt.Errorf("table %q is not accessible", tableName)
	}
	tableIdent, err := safeIdentifier(tableName)
	if err != nil {
		return err
	}
	pkIdent, err := safeIdentifier(pkColumn)
	if err != nil {
		return err
	}
	// Never allow modifying the PK itself.
	delete(data, pkColumn)
	if len(data) == 0 {
		return fmt.Errorf("no fields to update")
	}

	setClauses := make([]string, 0, len(data))
	args := make([]interface{}, 0, len(data)+1)

	i := 1
	for colName, val := range data {
		ci, ciErr := safeIdentifier(colName)
		if ciErr != nil {
			return ciErr
		}
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", ci, i))
		args = append(args, coerceArg(val))
		i++
	}
	args = append(args, coerceArg(pkValue))

	sql := fmt.Sprintf(
		`UPDATE %s SET %s WHERE %s = $%d`,
		tableIdent,
		strings.Join(setClauses, ", "),
		pkIdent,
		i,
	)

	db := database.GetDB()
	return db.Exec(sql, args...).Error
}

// ─── DeleteRow ────────────────────────────────────────────────────────────────

// DeleteRow removes the row identified by pkColumn = pkValue from the named table.
func (s *DbInspectorService) DeleteRow(tableName, pkColumn string, pkValue interface{}) error {
	if !s.isTableAllowed(tableName) {
		return fmt.Errorf("table %q is not accessible", tableName)
	}
	tableIdent, err := safeIdentifier(tableName)
	if err != nil {
		return err
	}
	pkIdent, err := safeIdentifier(pkColumn)
	if err != nil {
		return err
	}

	sql := fmt.Sprintf(`DELETE FROM %s WHERE %s = ?`, tableIdent, pkIdent)
	db := database.GetDB()
	return db.Exec(sql, coerceArg(pkValue)).Error
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// coerceArg converts JSON-decoded values (float64, map, slice, etc.) to
// types that database/sql can bind correctly.
func coerceArg(v interface{}) interface{} {
	if v == nil {
		return nil
	}
	switch val := v.(type) {
	case map[string]interface{}, []interface{}:
		b, err := json.Marshal(val)
		if err != nil {
			return fmt.Sprintf("%v", val)
		}
		return string(b)
	case float64:
		// JSON numbers arrive as float64; keep them as-is (postgres driver handles it).
		return val
	default:
		return v
	}
}
