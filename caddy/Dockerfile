# Custom Caddy build with caddy-l4 plugin (SNI router for prod L4 routing).
# See .agent/plans/phase-1-caddy-masking.md for context.
FROM caddy:2-builder AS builder

RUN xcaddy build \
    --with github.com/mholt/caddy-l4

FROM caddy:2-alpine

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
COPY render-caddyfile.sh /usr/local/bin/render-caddyfile.sh
COPY Caddyfile.template /etc/caddy/Caddyfile.template
RUN chmod +x /usr/local/bin/render-caddyfile.sh

ENV PANEL_DOMAIN="" \
    PANEL_SECRET_PREFIX="" \
    PANEL_DECOY_URL="https://example.com" \
    PANEL_BACKEND_HOST="127.0.0.1" \
    PANEL_BACKEND_PORT="2053" \
    SUB_BACKEND_PORT="2096"

ENTRYPOINT ["/usr/local/bin/render-caddyfile.sh"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
