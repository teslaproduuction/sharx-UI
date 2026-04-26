# Соответствие API панели и нового веба (Next)

Пути ниже — **логические** (после `webBasePath` и сегмента `panel/`, кроме корня и логина). Реальные URL: `{{basePath}}/panel/...` или `{{basePath}}/login` и т.д. Источник бэкенда: `../web/controller/*.go`; фронт: `panel/**/*.tsx`, `lib/*.ts`.

**Легенда:** `Да` — вызывается из TS/TSX; `Частично` — только навигация/текст/скачивание, не JSON API; `Нет` — эндпоинт в Go есть, в новом вебе не вызывается; `N/A` — не для браузера (автоматизация/нода).

## Auth и корень (`index.go` / без префикса `panel/`)

| Метод | Путь | Новый веб | Компонент / примечание |
|--------|------|-----------|------------------------|
| GET/HEAD | `/` | N/A | Редирект на `basePath` в `web.go` |
| GET/HEAD | `logout`, `logout/` | Частично | Ссылка «Выход» в [PanelShell.tsx](components/panel/PanelShell.tsx) → навигация, не `fetch` |
| POST | `login` | Да | [app/page.tsx](app/page.tsx) |
| POST | `getTwoFactorEnable` | Да | [app/page.tsx](app/page.tsx) |

## `panel/api/*` ([api.go](../web/controller/api.go))

| Метод | Путь | Новый веб | Компонент / примечание |
|--------|------|-----------|------------------------|
| * | `api/inbounds/*` | См. ниже | [InboundsPage.tsx](components/InboundsPage.tsx) — не все подпути |
| * | `api/server/*` | См. ниже | [DashboardPage.tsx](components/DashboardPage.tsx), [XrayPage.tsx](components/XrayPage.tsx) — не все подпути |
| GET | `api/backuptotgbot` | Нет | — |
| GET | `api/api-docs/markdown` | Да | [ApiDocsPage.tsx](components/ApiDocsPage.tsx) `fetch` |
| POST | `api/node/push-logs` | N/A | Ключ ноды, не сессия |

### `panel/api/inbounds/*` ([inbound.go](../web/controller/inbound.go))

| Метод | Подпуть | Новый веб | Компонент |
|--------|---------|-----------|------------|
| GET | `list` | Да | InboundsPage, HostsPage, GroupsPage, ClientsPage |
| GET | `get/:id` | Да | InboundsPage |
| GET | `getClientTraffics/:email` | Нет | — |
| GET | `getClientTrafficsById/:id` | Нет | — |
| POST | `add` | Да | InboundsPage |
| POST | `update/:id` | Да | InboundsPage |
| POST | `del/:id` | Да | InboundsPage |
| POST | `clientIps/:email` | Нет | — |
| POST | `clearClientIps/:email` | Нет | — |
| POST | `addClient` | Нет | — |
| POST | `/:id/delClient/:clientId` | Нет | — |
| POST | `updateClient/:clientId` | Нет | — |
| POST | `/:id/resetClientTraffic/:email` | Нет | — |
| POST | `resetAllTraffics` | Нет | — |
| POST | `resetAllClientTraffics/:id` | Нет | — |
| POST | `delDepletedClients/:id` | Нет | — |
| POST | `import` | Нет | — |
| POST | `onlines` | Нет | — |
| POST | `lastOnline` | Нет | — |
| POST | `updateClientTraffic/:email` | Нет | — |
| POST | `/:id/delClientByEmail/:email` | Нет | — |

### `panel/api/server/*` ([server.go](../web/controller/server.go))

| Метод | Подпуть | Новый веб | Компонент |
|--------|---------|-----------|------------|
| GET | `status` | Да | DashboardPage |
| GET | `cpuHistory/:bucket` | Да | DashboardPage |
| GET | `getXrayVersion` | Да | DashboardPage |
| GET | `getConfigJson` | Да | DashboardPage, XrayPage |
| GET | `getDb` | Частично | DashboardPage — `window.location` скачивание |
| GET | `getNewUUID` | Нет | — |
| GET | `getNewX25519Cert` | Нет | — |
| GET | `getNewmldsa65` | Нет | — |
| GET | `getNewmlkem768` | Нет | — |
| GET | `getNewVlessEnc` | Нет | — |
| POST | `stopXrayService` | Да | DashboardPage |
| POST | `restartXrayService` | Да | DashboardPage |
| POST | `installXray/:version` | Да | DashboardPage |
| POST | `installXrayOnNodes/:version` | Да | DashboardPage |
| POST | `updateGeofile` | Нет | — |
| POST | `updateGeofile/:fileName` | Нет | — |
| POST | `logs/:count` | Да | DashboardPage |
| POST | `xraylogs/:count` | Да | DashboardPage |
| POST | `importDB` | Да | DashboardPage |
| POST | `getNewEchCert` | Нет | — |
| GET | `metrics` | Нет | (JSON API; отдельно есть Prometheus `GET …/panel/metrics` в [web/web.go](../web/web.go)) |

## `panel/client/*` ([client.go](../web/controller/client.go), HWID: [client_hwid.go](../web/controller/client_hwid.go))

| Метод | Путь | Новый веб | Компонент |
|--------|------|-----------|------------|
| GET | `client/list` | Да | ClientsPage |
| GET | `client/get/:id` | Да | ClientsPage |
| GET | `client/sessions/:id` | Да | ClientsPage (active sessions / IPs modal) |
| POST | `client/sessions/drop/:id` | Да | ClientsPage (drop all or per-IP) |
| POST | `client/add` | Да | ClientsPage |
| POST | `client/update/:id` | Да | ClientsPage |
| POST | `client/del/:id` | Нет | — |
| POST | `client/resetAllTraffics` | Нет | — |
| POST | `client/resetTraffic/:id` | Нет | — |
| POST | `client/delDepletedClients` | Нет | — |
| POST | `client/clearHwid/:id` | Нет | — |
| POST | `client/clearAllHwids` | Нет | — |
| POST | `client/setHwidLimitAll` | Нет | — |
| POST | `client/bulk/resetTraffic` | Нет | — |
| POST | `client/bulk/clearHwid` | Нет | — |
| POST | `client/bulk/delete` | Нет | — |
| POST | `client/bulk/enable` | Нет | — |
| POST | `client/bulk/setHwidLimit` | Нет | — |
| GET | `client/hwid/list/:clientId` | Нет | — |
| POST | `client/hwid/add` | Нет | — |
| POST | `client/hwid/del/:id` | Нет | — |
| POST | `client/hwid/deactivate/:id` | Нет | — |
| POST | `client/hwid/check` | Нет | — |
| POST | `client/hwid/register` | Нет | — |
| POST | `client/hwid/fix-timestamps` | Нет | — |

## `panel/host/*` ([host.go](../web/controller/host.go))

| Метод | Путь | Новый веб | Компонент |
|--------|------|-----------|------------|
| GET | `host/list` | Да | HostsPage |
| GET | `host/get/:id` | Нет | — |
| POST | `host/add` | Да | HostsPage |
| POST | `host/update/:id` | Нет | — |
| POST | `host/del/:id` | Нет | — |

## `panel/node/*` ([node.go](../web/controller/node.go))

| Метод | Путь | Новый веб | Компонент |
|--------|------|-----------|------------|
| GET | `node/list` | Да | NodesPage, InboundsPage, XrayCoreConfigProfilesPage, DashboardPage |
| GET | `node/get/:id` | Нет | — |
| POST | `node/add` | Да | NodesPage |
| POST | `node/update/:id` | Нет | — |
| POST | `node/del/:id` | Нет | — |
| POST | `node/check/:id` | Нет | — |
| POST | `node/checkAll` | Нет | — |
| POST | `node/reload/:id` | Нет | — |
| POST | `node/reloadAll` | Нет | — |
| GET | `node/status/:id` | Нет | — |
| POST | `node/logs/:id` | Нет | — |
| POST | `node/check-connection` | Да | NodesPage |
| POST | `node/resetTraffic/:id` | Нет | — |

## `panel/group/*` ([client_group.go](../web/controller/client_group.go))

| Метод | Путь | Новый веб | Компонент |
|--------|------|-----------|------------|
| GET | `group/list` | Да | GroupsPage, ClientsPage |
| GET | `group/get/:id` | Нет | — |
| POST | `group/add` | Да | GroupsPage |
| POST | `group/update/:id` | Да | GroupsPage |
| POST | `group/del/:id` | Да | GroupsPage |
| GET | `group/:id/clients` | Нет | — |
| POST | `group/:id/assignClients` | Нет | — |
| POST | `group/:id/removeClients` | Нет | — |
| POST | `group/:id/bulk/resetTraffic` | Да | GroupsPage |
| POST | `group/:id/bulk/clearHwid` | Да | GroupsPage |
| POST | `group/:id/bulk/delete` | Да | GroupsPage |
| POST | `group/:id/bulk/enable` | Да | GroupsPage |
| POST | `group/:id/bulk/setHwidLimit` | Да | GroupsPage |
| POST | `group/:id/bulk/assignInbounds` | Да | GroupsPage |

## `panel/outbound/*` ([outbound.go](../web/controller/outbound.go))

| Метод | Путь | Новый веб | Компонент |
|--------|------|-----------|------------|
| GET | `outbound/list` | Да | [SimpleListPage](components/SimpleListPage.tsx) + [app/panel/outbounds/page.tsx](app/panel/outbounds/page.tsx) |
| GET | `outbound/get/:id` | Нет | — |
| POST | `outbound/add` | Нет | — |
| POST | `outbound/del/:id` | Нет | — |
| POST | `outbound/update/:id` | Нет | — |

## `panel/xray/*` ([xray_setting.go](../web/controller/xray_setting.go))

| Метод | Путь | Новый веб | Компонент |
|--------|------|-----------|------------|
| GET | `xray/getDefaultJsonConfig` | Нет | — |
| GET | `xray/getOutboundsTraffic` | Нет | — |
| GET | `xray/getXrayResult` | Да | XrayPage |
| POST | `xray/` (тело пустое — загрузка настроек) | Да | XrayPage |
| POST | `xray/getFullConfig` | Нет | — |
| POST | `xray/warp/:action` | Нет | — |
| POST | `xray/update` | Да | XrayPage |
| POST | `xray/resetToDefault` | Да | XrayPage |
| POST | `xray/resetOutboundsTraffic` | Нет | — |

## `panel/setting/*` + миграция ([setting.go](../web/controller/setting.go), [migration.go](../web/controller/migration.go))

| Метод | Путь | Новый веб | Компонент |
|--------|------|-----------|------------|
| POST | `setting/all` | Да | SettingsPage, PanelShell, DashboardPage, XrayPage, XrayCoreConfigProfilesPage |
| POST | `setting/defaultSettings` | Да | DashboardPage (bootstrap) |
| POST | `setting/update` | Да | SettingsPage |
| POST | `setting/updateUser` | Да | SettingsPage |
| POST | `setting/restartPanel` | Да | SettingsPage, DashboardPage (после importDB) |
| GET | `setting/getDefaultJsonConfig` | Нет | — |
| GET | `setting/grafana/dashboard` | Частично | SettingsPage — `window.location` |
| POST | `setting/migration/preview` | Нет | — |
| POST | `setting/migration/execute` | Нет | — |

## `panel/xray-core-config-profile/*` ([xray_core_config_profile.go](../web/controller/xray_core_config_profile.go))

| Метод | Путь | Новый веб | Компонент |
|--------|------|-----------|------------|
| * | (все CRUD/assign) | Да | [XrayCoreConfigProfilesPage.tsx](components/XrayCoreConfigProfilesPage.tsx) |

## Прочее

| Метод | Путь | Новый веб | Компонент / примечание |
|--------|------|-----------|------------------------|
| GET | `ws` (от корня, см. [web/web.go](../web/web.go)) | Да | [useWebSocket.ts](lib/useWebSocket.ts) → DashboardPage |
| GET | `panel/metrics` (Prometheus) | Частично | В [SettingsPage.tsx](components/SettingsPage.tsx) отображается путь; открытие вручную |
| * | `locales/:lang` | Да (статик) | [i18n.ts](lib/i18n.ts) |

---

## Приоритизация пробелов (для согласования с продуктом)

Ниже — **предлагаемый инженерный порядок** внедрения UI. Финальные P0/P1 критерии — за владельцем продукта; строка «Статус согласования» для отметки.

| Приоритет | Зона | Обоснование | Статус согласования |
|-----------|------|-------------|---------------------|
| P0 | Клиенты: delete, сброс трафика, bulk, HWID | Ежедневные админ-операции, без API/CLI риск блокировок | _не заполнено_ |
| P0 | Ноды: update, delete, check, reload, логи | Управление жизненным циклом нод без старой панели | _не заполнено_ |
| P0 | Хосты: get/update/delete | Иначе только добавление списка | _не заполнено_ |
| P1 | Инбаунды: трафик клиентов, onlines, import, sub-клиенты | Расширенная диагностика и миграции | _не заполнено_ |
| P1 | Миграция БД `setting/migration/*` | Развёртывание PostgreSQL | _не заполнено_ |
| P1 | Outbound CRUD | Сейчас только просмотр списка | _не заполнено_ |
| P2 | Xray: `getOutboundsTraffic`, `getFullConfig`, `warp`, `resetOutboundsTraffic`, `getDefaultJsonConfig` | Доп. инструменты, часть доступна через JSON вручную | _не заполнено_ |
| P2 | Server: `updateGeofile`, генераторы сертификатов, `getMetrics` | Редкие обслуживания; часть — для скриптов | _не заполнено_ |
| P2 | `api/backuptotgbot` | Обычно кнопка/хук; можно оставить только API | _не заполнено_ |
| P3 | Group: get/:id, assign/remove clients | Возможно избыточно при достаточном `list` | _не заполнено_ |

---

## Поддержка матрицы

Пересобрать сырые списки и проверить вызовы `panel(`:

```bash
./scripts/audit-panel-api-coverage.sh
```

Из корня репозитория `sharx-code/` (см. [scripts/audit-panel-api-coverage.sh](../scripts/audit-panel-api-coverage.sh)).

После крупных изменений API обновляйте таблицы в этом файле вручную; скрипт не вычисляет «Да/Нет» автоматически.
