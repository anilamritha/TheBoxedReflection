#!/bin/bash
# Double click this to run The Boxed Reflection on this machine.
#
# It starts a small web server in this folder and opens the control page.
# The piece HAS to be served over http:// rather than opened as a file,
# because the control page and the projection page talk to each other over
# BroadcastChannel and that only connects pages sharing an origin. A file://
# page has an origin of its own, so the two would never find each other.
#
# Leave this Terminal window open while the piece is running. Close it, or
# press Control and C, when you are finished.

cd "$(dirname "$0")" || exit 1

PORT=8311
while lsof -i ":$PORT" >/dev/null 2>&1; do PORT=$((PORT+1)); done

echo ""
echo "  The Boxed Reflection"
echo "  --------------------"
echo "  Control page      http://localhost:$PORT"
echo "  Projection page   http://localhost:$PORT/show.html"
echo ""
echo "  Leave this window open. Press Control and C to stop."
echo ""

( sleep 1 && open "http://localhost:$PORT" ) &
python3 -m http.server "$PORT"
