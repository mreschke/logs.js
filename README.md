logs.js
=======

Node.js and socket.io live log viewer. Live log streaming via websockets and fs.watchFile (aka tail -f)

Uses basic HTTP authentication by default, user/pass are in logs.js code

Friendly URLs:
* logs.example.com
* logs.example.com/view/some/local/folder/
* logs.example.com/view/some/local/folder/mylog.txt
* logs.example.com/tail/some/local/folder/mylog.txt


install
=======
cd into source directory
npm install
./logs.js

or if you have forever installed there is a bash script in the bin dir (edit that script first, set your path to logs.js)
bin/forever start
bin/forever stop
bin/forever restart
bin/forever log
