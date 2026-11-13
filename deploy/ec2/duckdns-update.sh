#!/bin/sh
set -eu

: "${DUCKDNS_TOKEN:?DUCKDNS_TOKEN is required}"
: "${DUCKDNS_DOMAIN:?DUCKDNS_DOMAIN is required}"
rm -f /tmp/duckdns-ready

while :; do
    # An empty ip lets DuckDNS use this EC2 instance's outbound public IPv4.
    # Pass the URL through curl's stdin so the token is absent from process arguments.
    response="$(printf 'url = "https://www.duckdns.org/update?domains=%s&token=%s&ip="\n' \
        "$DUCKDNS_DOMAIN" "$DUCKDNS_TOKEN" | \
        curl --config - --ipv4 --fail --silent --show-error --max-time 20)" || response=

    if [ "$response" = OK ]; then
        touch /tmp/duckdns-ready
        echo 'DuckDNS update succeeded'
        sleep 300
    else
        rm -f /tmp/duckdns-ready
        echo 'DuckDNS update failed; retrying in 60 seconds' >&2
        sleep 60
    fi
done
