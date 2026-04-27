# Hysteria 2: как устроено в Xray и в панели

Hy2 в Xray разделено на **протокол** (`protocol: hysteria`) и **транспорт QUIC-TLS** (`streamSettings.network: hysteria`). Версия протокола задаётся числом **`2`** в `inbound.settings.version` / `outbound.settings.version` и в `streamSettings.hysteriaSettings.version`.

## Где что лежит

| Смысл | Сервер (inbound) | Клиент (outbound) |
|--------|------------------|-------------------|
| Адрес и порт | `port`, `listen` | `settings.address`, `settings.port` |
| Пароль пользователя | `settings.clients[].auth` (для Xray не `password`) | `streamSettings.hysteriaSettings.auth` |
| Версия Hy | `settings.version: 2` | `settings.version: 2` |
| QUIC-TLS | `streamSettings`: `network`, `security`, `tlsSettings`, `hysteriaSettings` | то же |
| SNI / ALPN / серт | `tlsSettings` (сервер: `certificates`; клиент: `serverName`, `alpn`, `allowInsecure` или pin) | то же на клиенте |

Подписка в панели собирает outbound в **`sub/subJsonService.go`** (`genHy`): копирует `streamSettings` с инбаунда, подставляет **`hysteriaSettings.auth`** и **`settings.address` / `settings.port`**.

Форма инбаунда в Next-панели сериализует stream в **`panel/lib/inboundDefaults.ts`** (`buildHysteriaStreamSettingsFromForm`): TLS для QUIC, `hysteriaSettings.version`, пустой `auth` на сервере (пароли только в `clients`).

## Файлы в этой папке

- **`01-xray-inbound-hysteria2.example.json`** — минимальный **серверный** фрагмент: один inbound Hy2 (как ядро на ноде). Подставьте `listen`, `port`, PEM в `certificates`, `clients[].auth`.
- **`02-xray-client-hysteria2-outbound.example.json`** — **второе ядро / клиент**: локальный SOCKS → outbound `hysteria` до того же сервера. Используйте для проверки совместимости с инбаундом и для сравнения с подпиской.
- **`03-apernet-hysteria2-server.example.yaml`** — эталон **официального** сервера [apernet/hysteria](https://github.com/apernet/hysteria) (не Xray). Полезно, если нужно отличить баг Xray от сети/UDP/TLS.

## URI `hysteria2://`

Часть до `@` — это **`auth`**. Query: обычно `sni`, `alpn`, `insecure`, `fp` (uTLS / fingerprint в клиентских приложениях). Xray в outbound часто задаёт SNI и `allowInsecure` / pin в `tlsSettings`.

## UDP

Hy2 сидит поверх **QUIC (UDP)**. Без доставки UDP на порт сервера соединение не установится.

## Панель: на что смотреть при правках

1. В БД/конфиге инбаунда у клиентов Hy2 должен быть **`auth`**, не только `password` (Xray inbound).
2. Подписка **`genHy`**: для адреса клиента берётся **`inbound.Listen`** — для публичных нод обычно нужен внешний хост/домен в ссылках (отдельная логика в sub, не только `Listen`).
3. Протокол в JSON: Xray ожидает **`hysteria`**, версия **`2`** в `settings` / `hysteriaSettings`. В подписке outbound теперь всегда **`protocol: hysteria`** (раньше мог уезжать литерал `hysteria2`).
4. **`allowInsecure`**: в форме он пишется в **корень** `tlsSettings`. Раньше **`tlsData`** (JSON подписки) и **`hysteriaLinkForAuth`** смотрели только в **`tlsSettings.settings`**, из‑за чего клиенты и `hysteria2://…` **не получали** `allowInsecure` / `insecure=1` при самоподписанном серте. Исправлено: учитывается корневой флаг.
5. Кнопка самоподписанного серта: в API уходят **`dnsNames`** (SNI + `localhost`) и **`ipAddresses: 127.0.0.1`**, как в рабочем E2E (SAN для IP и локальных тестов).

Скрипт проверки: `../test-hysteria2-connection.sh` (Xray + SOCKS + curl).

## Локальный E2E: два ядра + самоподписанный серт

`../hysteria2-local-e2e/run-e2e.sh` — OpenSSL генерирует PEM (SAN: `vk.com`, `localhost`, `127.0.0.1`), пишет серверный JSON в формате панели (массивы строк в `tlsSettings.certificates`), клиентский JSON, ссылку `hysteria2://…`, поднимает два процесса Xray и делает `curl` через SOCKS. Артефакты: `hysteria2-local-e2e/out/` (в `.gitignore`).
