#!/bin/bash
set -eu
cd "$(dirname "$0")"
exec python3 -B -m unittest -v test_zhivaya_montazh test_zhivaya_obshchij test_zhivaya_rotaciya test_zhivaya_ctime
