# Переменные окружения SharX

## Основное приложение (Panel)

### Web Panel настройки (только через env, не доступны в UI)

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `XUI_WEB_PORT` | Порт веб-панели | `2053` | `2053` |
| `XUI_WEB_LISTEN` | IP адрес для прослушивания веб-панели | - | `0.0.0.0` |
| `XUI_WEB_DOMAIN` | Домен веб-панели | - | `panel.example.com` |
| `XUI_WEB_BASE_PATH` | Базовый путь URL для веб-панели | `/` | `/` |
| `XUI_WEB_CERT_FILE` | Путь к SSL сертификату для веб-панели | - | `/app/cert/fullchain.pem` |
| `XUI_WEB_KEY_FILE` | Путь к SSL приватному ключу для веб-панели | - | `/app/cert/privkey.pem` |

### Subscription настройки (только через env, не доступны в UI)

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `XUI_SUB_PORT` | Порт сервиса подписки | `2096` | `2096` |
| `XUI_SUB_PATH` | URI путь для подписки | `/sub/` | `/sub/` |
| `XUI_SUB_DOMAIN` | Домен для сервиса подписки | - | `sub.example.com` |
| `XUI_SUB_CERT_FILE` | Путь к SSL сертификату для подписки | - | `/app/cert/sub-fullchain.pem` |
| `XUI_SUB_KEY_FILE` | Путь к SSL приватному ключу для подписки | - | `/app/cert/sub-privkey.pem` |

### База данных PostgreSQL

| Переменная | Описание | Значение по умолчанию | Обязательная | Пример |
|------------|----------|----------------------|--------------|--------|
| `XUI_DB_HOST` | Хост PostgreSQL | `localhost` | Нет | `postgres` |
| `XUI_DB_PORT` | Порт PostgreSQL | `5432` | Нет | `5432` |
| `XUI_DB_USER` | Пользователь PostgreSQL | - | **Да** | `xui_user` |
| `XUI_DB_PASSWORD` | Пароль PostgreSQL | - | **Да** | `change_this_password` |
| `XUI_DB_NAME` | Имя базы данных | Имя приложения | Нет | `xui_db` |
| `XUI_DB_SSLMODE` | Режим SSL для PostgreSQL | `disable` | Нет | `disable`, `require`, `verify-ca`, `verify-full` |

### Логирование и отладка

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `XUI_LOG_LEVEL` | Уровень логирования | `info` | `debug`, `info`, `notice`, `warning`, `error` |
| `XUI_DEBUG` | Режим отладки | `false` | `true`, `false` |
| `XUI_LOG_FOLDER` | Папка для логов | Зависит от платформы | `/var/log/x-ui` |

### Пути и папки

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `XUI_BIN_FOLDER` | Папка для бинарных файлов | `bin` | `/app/bin` |

### Xray настройки

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `XRAY_VMESS_AEAD_FORCED` | Принудительное использование VMESS AEAD | `false` | `true`, `false` |

### Безопасность

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `XUI_ENABLE_FAIL2BAN` | Включить fail2ban | `true` | `true`, `false` |

---

## Node Service (Worker)


### TLS настройки

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `NODE_TLS_CERT_FILE` | Путь к SSL сертификату для API ноды | - | `/app/cert/node-cert.pem` |
| `NODE_TLS_KEY_FILE` | Путь к SSL приватному ключу для API ноды | - | `/app/cert/node-key.pem` |

*Примечание: `NODE_API_KEY` не обязателен при первом запуске, но нода должна быть зарегистрирована через `/api/v1/register` endpoint.

---

## PostgreSQL (для docker-compose)

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `POSTGRES_USER` | Пользователь PostgreSQL | - | `xui_user` |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL | - | `change_this_password` |
| `POSTGRES_DB` | Имя базы данных | - | `xui_db` |

---

## Пример использования в docker-compose.yml

```yaml
services:
  sharx:
    environment:
      # Xray настройки
      XRAY_VMESS_AEAD_FORCED: "false"
      XUI_ENABLE_FAIL2BAN: "true"
      #XUI_LOG_LEVEL: "debug"
      
      # Web Panel настройки (только через env, не доступны в UI)
      # XUI_WEB_PORT: 2053
      # XUI_WEB_LISTEN: 0.0.0.0
      # XUI_WEB_DOMAIN: panel.example.com
      # XUI_WEB_BASE_PATH: /
      # XUI_WEB_CERT_FILE: /app/cert/fullchain.pem
      # XUI_WEB_KEY_FILE: /app/cert/privkey.pem
      
      # Subscription настройки (только через env, не доступны в UI)
      # XUI_SUB_PORT: 2096
      # XUI_SUB_PATH: /sub/
      # XUI_SUB_DOMAIN: sub.example.com
      # XUI_SUB_CERT_FILE: /app/cert/sub-fullchain.pem
      # XUI_SUB_KEY_FILE: /app/cert/sub-privkey.pem
      
      # PostgreSQL настройки
      XUI_DB_HOST: postgres
      XUI_DB_PORT: 5432
      XUI_DB_USER: xui_user
      XUI_DB_PASSWORD: change_this_password
      XUI_DB_NAME: xui_db
      XUI_DB_SSLMODE: disable
```

---

## v2.0 — Phase 1 (Caddy masking) + Phase 2 (sing-box)

### Caddy panel front-door

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `PANEL_DOMAIN` | Домен панели (без него Caddy слушает `:443` с self-signed) | — | `panel.example.com` |
| `PANEL_SECRET_PREFIX` | Случайный URL-префикс, скрывающий панель за `/<prefix>/` | — | `6bc0dc699a0ee99a` |
| `PANEL_DECOY_URL` | Куда Caddy reverse-proxy'ит нераспознанные пути (Hiddify-pattern) | `https://example.com` | `https://news.ycombinator.com` |
| `PANEL_BACKEND_HOST` | Хост, куда Caddy форвардит трафик панели | `127.0.0.1` | `127.0.0.1` |
| `PANEL_BACKEND_PORT` | Порт панели за Caddy | `2053` | `2053` |
| `SUB_BACKEND_PORT` | Порт subscription за Caddy | `2096` | `2096` |
| `NEXT_PUBLIC_BASE_PATH` | Bake-time префикс Next.js (= `PANEL_SECRET_PREFIX` с `/.../`) | `/` | `/6bc0dc699a0ee99a/` |

### Sing-box singleton sidecar (Phase 2 — mieru/AnyTLS/Naïve/TUIC)

| Переменная | Описание | Значение по умолчанию | Пример |
|------------|----------|----------------------|--------|
| `SINGBOX_BIN` | Путь к hiddify-sing-box бинарю | `/app/bin/sing-box` | `/usr/local/bin/sing-box` |
| `SINGBOX_WORK_ROOT` | Per-instance config + work dir | `/app/singbox` или `${XUI_DATA_FOLDER}/singbox` | `/srv/singbox` |

`NEXT_PUBLIC_BASE_PATH` обязательно совпадает с `PANEL_SECRET_PREFIX` (+ ведущий/завершающий `/`). Несовпадение → ассеты Next.js указывают на корневой путь и Caddy decoy их перехватит → blank screen.

## Примечания

1. **Web Panel и Subscription настройки** (`XUI_WEB_*` и `XUI_SUB_*`) доступны **только через переменные окружения** и не могут быть изменены через веб-интерфейс.

2. **База данных**: `XUI_DB_USER`, `XUI_DB_PASSWORD` являются обязательными для работы приложения.

3. **Phase 1 маскировка обязательна**: панель должна быть скрыта за `PANEL_SECRET_PREFIX` + Caddy decoy. Прямое выставление панели на публичный 2053 категорически не рекомендуется — DPI/RKN мгновенно её обнаруживает.

4. **Multi-node sing-box**: воркеры получают sing-box config через apply-config envelope (поле `singbox: {cfg, configHash}`). Бинарь sing-box должен лежать в `SINGBOX_BIN` на воркере (наш `node/Dockerfile` копирует его из `singbox-fetch` стейджа).

5. **Cascade hub на panel-host**: в multi-node режиме panel-host sing-box живёт + обслуживает inbound'ы и OutboundSidecar с пустым `NodeIds`. Это позволяет панели быть entry-узлом каскада (RU → cascade outbound → IN worker → exit).


3. Все пути к сертификатам должны быть абсолютными путями внутри контейнера (обычно /app/cert/*.pem).
