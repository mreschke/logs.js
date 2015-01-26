logs.js
=======

Watch live log output on the web.  This is like tail -f but in a browser using Node.js and Socket.io

Uses basic HTTP authentication, users are stored in config/config.json

Friendly URLs:
* logs.example.com
* logs.example.com/view/some/local/folder/
* logs.example.com/view/some/local/folder/mylog.txt
* logs.example.com/tail/some/local/folder/mylog.txt


install
=======
git clone into logs.js directory
cd logs.js
npm install

Edit config/config.json with the proper users and log locations

./logs.js

or if you have forever installed there is a bash script called forever
cd logs.js
sudo ./forever start
sudo ./forever stop
sudo ./forever restart
./forever log

The port is configured in config/config.json, simply visit http://localhost:port to see logs.js in action
