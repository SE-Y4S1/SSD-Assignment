#!/usr/bin/env bash
# Container-level verification of the V-D fixes against the running stack.
cd "C:/Users/LENOVO/Desktop/SSD-Analysis/SSD-Assignment" || exit 1

pass=0; fail=0
check () { # label, expected, observed, condition
  if eval "$4"; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1"; fail=$((fail+1)); fi
  echo "      expected: $2"
  echo "      observed: $3"
}

# V-D11: data stores must not be reachable from the network
mongo_bind=$(docker compose port mongo 27017 2>/dev/null || echo "not published")
redis_bind=$(docker compose port redis 6379 2>/dev/null || echo "not published")
kafka_bind=$(docker compose port kafka 9092 2>/dev/null || echo "not published")
zk_bind=$(docker compose port zookeeper 2181 2>/dev/null || echo "not published")
check "V-D11 mongo is bound to loopback only" "127.0.0.1:27017" "$mongo_bind" '[[ "$mongo_bind" == 127.0.0.1:* ]]'
check "V-D11 redis is bound to loopback only" "127.0.0.1:6379" "$redis_bind" '[[ "$redis_bind" == 127.0.0.1:* ]]'
check "V-D11 kafka publishes no host port" "not published" "$kafka_bind" '[[ "$kafka_bind" == "not published" || -z "$kafka_bind" ]]'
check "V-D11 zookeeper publishes no host port" "not published" "$zk_bind" '[[ "$zk_bind" == "not published" || -z "$zk_bind" ]]'

# V-D13: frontend container runs as a non-root user
fe_id=$(docker compose exec -T frontend id 2>/dev/null | tr -d '\r')
check "V-D13 frontend container runs as non-root" "uid=1000(node)" "$fe_id" '[[ "$fe_id" == uid=1000* ]]'

# V-D29: no public DNS override on the containers
dns_count=$(docker inspect $(docker compose ps -q) 2>/dev/null | grep -c '"8.8.8.8"')
check "V-D29 no container uses a public DNS override" "0 references to 8.8.8.8" "$dns_count references" '[[ "$dns_count" == "0" ]]'

# V-D04: the provider key must not be in the served bundle
key_refs=$(docker compose exec -T frontend sh -c "grep -rl 'NEXT_PUBLIC_GROQ_KEY' .next 2>/dev/null | wc -l" | tr -d '\r ')
groq_url=$(docker compose exec -T frontend sh -c "grep -rl 'api.groq.com' .next 2>/dev/null | wc -l" | tr -d '\r ')
check "V-D04 no provider key variable in the built bundle" "0 files" "$key_refs files" '[[ "$key_refs" == "0" ]]'
check "V-D04 the browser no longer calls the provider directly" "0 files referencing api.groq.com" "$groq_url files" '[[ "$groq_url" == "0" ]]'

# V-D17: the consent control must be present in the shipped scribe component
consent=$(docker compose exec -T frontend sh -c "grep -rl 'Allow and start' .next 2>/dev/null | wc -l" | tr -d '\r ')
check "V-D17 consent control ships in the built frontend" "at least 1 file" "$consent files" '[[ "$consent" -ge 1 ]]'

# V-D19/V-D20: images install from the lockfile and carry no dev dependencies
nodemon=$(docker compose exec -T telemedicine sh -c "ls node_modules | grep -c '^nodemon$'" 2>/dev/null | tr -d '\r ')
check "V-D20 dev dependencies absent from the runtime image" "0 (nodemon not installed)" "$nodemon" '[[ "$nodemon" == "0" ]]'

echo
echo "container checks: $pass passed, $fail failed"
