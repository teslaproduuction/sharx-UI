package controller

import (
	"strconv"

	"github.com/konstpic/sharx-code/v2/web/service"

	"github.com/gin-gonic/gin"
)

// DbInspectorController exposes database introspection and CRUD endpoints
// under /panel/db/*. All routes require session login (enforced by the parent
// /panel group middleware via checkLogin).
type DbInspectorController struct {
	svc service.DbInspectorService
}

// NewDbInspectorController creates the controller and registers its routes on g.
// g is expected to be the /panel router group (already wrapped with checkLogin).
func NewDbInspectorController(g *gin.RouterGroup) *DbInspectorController {
	a := &DbInspectorController{}
	a.initRouter(g)
	return a
}

func (a *DbInspectorController) initRouter(g *gin.RouterGroup) {
	db := g.Group("/db")

	// List all accessible tables with estimated row counts.
	db.GET("/tables", a.listTables)

	// Get schema (columns, types, PK) for a single table.
	db.GET("/tables/:table/schema", a.getTableSchema)

	// Get paginated, sorted, searched rows.
	db.GET("/tables/:table/rows", a.getTableRows)

	// Create a new row.
	db.POST("/tables/:table/rows", a.createRow)

	// Update a row identified by its primary key value.
	db.POST("/tables/:table/rows/:pk", a.updateRow)

	// Delete a row identified by its primary key value.
	db.POST("/tables/:table/rows/:pk/delete", a.deleteRow)
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// listTables returns all accessible tables with estimated row counts.
func (a *DbInspectorController) listTables(c *gin.Context) {
	tables, err := a.svc.ListTables()
	if err != nil {
		jsonMsg(c, "Failed to list tables", err)
		return
	}
	jsonObj(c, tables, nil)
}

// getTableSchema returns column metadata for the requested table.
func (a *DbInspectorController) getTableSchema(c *gin.Context) {
	tableName := c.Param("table")
	if tableName == "" {
		jsonMsg(c, "Table name required", errBadRequest("table name is empty"))
		return
	}

	schema, err := a.svc.GetTableSchema(tableName)
	if err != nil {
		jsonMsg(c, "Failed to get schema", err)
		return
	}
	jsonObj(c, schema, nil)
}

// getTableRows returns paginated rows for the requested table.
// Query parameters: page, pageSize, search, sortColumn, sortDir.
func (a *DbInspectorController) getTableRows(c *gin.Context) {
	tableName := c.Param("table")
	if tableName == "" {
		jsonMsg(c, "Table name required", errBadRequest("table name is empty"))
		return
	}

	q := service.TableQuery{
		Page:       intQueryParam(c, "page", 1),
		PageSize:   intQueryParam(c, "pageSize", 25),
		SortColumn: c.Query("sortColumn"),
		SortDir:    c.Query("sortDir"),
		Search:     c.Query("search"),
	}

	data, err := a.svc.GetTableData(tableName, q)
	if err != nil {
		jsonMsg(c, "Failed to get rows", err)
		return
	}
	jsonObj(c, data, nil)
}

// createRow inserts a new row into the table from the JSON body.
func (a *DbInspectorController) createRow(c *gin.Context) {
	tableName := c.Param("table")
	if tableName == "" {
		jsonMsg(c, "Table name required", errBadRequest("table name is empty"))
		return
	}

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonMsg(c, "Invalid request body", err)
		return
	}

	if err := a.svc.CreateRow(tableName, body); err != nil {
		jsonMsg(c, "Failed to create row", err)
		return
	}
	jsonMsg(c, "Row created", nil)
}

// updateRow modifies the row identified by :pk in the URL.
// The JSON body must include a "pkColumn" field naming the PK column and
// any fields to update.
func (a *DbInspectorController) updateRow(c *gin.Context) {
	tableName := c.Param("table")
	pkValue := c.Param("pk")
	if tableName == "" || pkValue == "" {
		jsonMsg(c, "Table name and PK value required", errBadRequest("missing params"))
		return
	}

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonMsg(c, "Invalid request body", err)
		return
	}

	pkColumn, ok := body["pkColumn"].(string)
	if !ok || pkColumn == "" {
		jsonMsg(c, "pkColumn required in body", errBadRequest("pkColumn missing"))
		return
	}
	delete(body, "pkColumn")

	if err := a.svc.UpdateRow(tableName, pkColumn, pkValue, body); err != nil {
		jsonMsg(c, "Failed to update row", err)
		return
	}
	jsonMsg(c, "Row updated", nil)
}

// deleteRow removes the row identified by :pk.
// The JSON body must include a "pkColumn" field.
func (a *DbInspectorController) deleteRow(c *gin.Context) {
	tableName := c.Param("table")
	pkValue := c.Param("pk")
	if tableName == "" || pkValue == "" {
		jsonMsg(c, "Table name and PK value required", errBadRequest("missing params"))
		return
	}

	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonMsg(c, "Invalid request body", err)
		return
	}

	pkColumn, ok := body["pkColumn"].(string)
	if !ok || pkColumn == "" {
		jsonMsg(c, "pkColumn required in body", errBadRequest("pkColumn missing"))
		return
	}

	if err := a.svc.DeleteRow(tableName, pkColumn, pkValue); err != nil {
		jsonMsg(c, "Failed to delete row", err)
		return
	}
	jsonMsg(c, "Row deleted", nil)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type badRequestErr string

func (e badRequestErr) Error() string { return string(e) }

func errBadRequest(msg string) error { return badRequestErr(msg) }

// intQueryParam reads an integer query parameter, returning def on missing/parse error.
func intQueryParam(c *gin.Context, key string, def int) int {
	v := c.Query(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return def
	}
	return n
}
