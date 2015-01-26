#!/usr/bin/env node

//Logs node.js server (live log streaming and viewing)
//mReschke 2013-02-19

var express = require('express')
	, app = express()
	, http = require('http')
	, server = http.createServer(app)
	, io = require('socket.io').listen(server)
	, connect = require('connect')
	, cookie = require('cookie')
	, util = require('util')
	, fs = require('fs')
	, dateFormat = require('dateformat')
	, config = require('nconf');

var backlog_size = 2000;
var sessionStore;

//Init Env Configuration
config.argv().file({ file: './config/config.json'});

//Get Allowed Users
var users = config.get('users');

//Init Session Store
sessionStore = new express.session.MemoryStore;

//Configure Express
app.configure(function() {
	//Middleware
	app.use(express.bodyParser()); //for parsing app.post req.body.variables
	app.use(express.cookieParser());

	//Enabled X-Forward-For for haproxy use
	//app.enable('trust proxy'); 

	var sessionTimeout = 20 * 60 * 1000 //20 minutes
	app.use(express.session({store: sessionStore
		, secret: 'secret'
		, key: 'express.sid'
		, cookie: { maxAge: sessionTimeout }
	}));

	app.use(express.basicAuth(function (username, password) {
		//Basic HTTP authentication using simple array, enhance as needed
		return users[username] == password;
	}));

});

//Configure socket.io
io.configure(function () {
	io.enable('browser client minification');
	io.enable('browser client etag');
	io.enable('browser client gzip');
	io.set('resource', '/socket.io');
	io.set('log level', config.get('log_level'));
	//defaults to websocket, htmlfile, xhr-polling, jsonp-polling (flashsocket is optional for IE8/9...)
	io.set('transports', [
		'websocket',
		'htmlfile',
		'xhr-polling',
		'jsonp-polling'
	]);
	io.set('authorization', function (data, accept) {
	    if (data.headers.cookie) {
	        data.cookie = connect.utils.parseSignedCookies(cookie.parse(decodeURIComponent(data.headers.cookie)), 'secret');
	        data.sessionID = data.cookie['express.sid'];

	        //Get the session data from the session store
	        sessionStore.get(data.sessionID, function (err, session) {
	            if (err || !session) {
	                // if we cannot grab a session, turn down the connection
	                accept('Error', false);
	            } else {
	                // save the session data and accept the connection
	                data.session = session;
	                accept(null, true);
	            }
	        });
	    } else {
	    	//log(util.inspect(data));
	    	return accept('No cookie transmitted.', false);
	    }
	});
});

//Routing
app.get(config.get('base_url'), function (req, res) {
	//List main log folders
	log("Browse 'root' from session " + req.sessionID);
	out = fs.readFileSync(__dirname + '/public/html/header.html');
	out += fs.readFileSync(__dirname + '/public/html/locations.html');
	out += fs.readFileSync(__dirname + '/public/html/footer.html');
	res.send(out);

});
app.get(config.get('base_url') + 'view/*', function (req, res) {
	path = "/" + req.params.toString();
	if (path.substring(path.length-1) == "/") {
		//Path is a folder, show contents of folder
		log("Browse '" + path + "' from session " + req.sessionID);
		fs.readdir(path, function (err, files) {
			files.sort();
			files.reverse();
			if (err) throw err;
			out = fs.readFileSync(__dirname + '/public/html/header.html');
			out += "<table class='datatables'>";
			for (i=0; i<=files.length -1; i++) {
				stats = fs.statSync(path + files[i]);
				out += "<tr>";
				if (stats.isDirectory()) {
					out += "<td><div class='folder'></td>";
					out += "<td><div class='item'><a href='" + files[i] + "/'>" + files[i] + "</a></div></td>";
					out += "<td>&nbsp;</td><td>&nbsp;</td>";
				} else {
					out += "<td><div class='file'></td>";
					out += "<td><div class='item'><a href='" + files[i] + "'>" + files[i] + "</a></div></td>";
					//out += "<span class='item_tail'><a href='/tail" + path + files[i] + "'><img src='/images/tail.png' class='tail_img' /></a></span></div>";
					out += "<td><span class='item_size'>" + Math.round(stats.size / 1024) + "k</span></td>";
					out += "<td><span class='lbracket'>[</span>";
					out += "<span class='item_tail'><a href='/tail" + path + files[i] + "'>Live Stream</a></span>";
					out += "<span class='separator'>|</span>";
					out += "<span class='item_download'><a href='/download" + path + files[i] + "'>Download</a></span>";
					out += "<span class='rbracket'>]</span></td>";
				}
				out += "</tr>";
			}
			out += "</table>";
			out += fs.readFileSync(__dirname + '/public/html/footer.html');
			res.send(out);
		});
	} else {
		//Path is a file, read file
		log("Read '" + path + "' from session " + req.sessionID);
		data = fs.readFileSync(path).toString();
		//data = data.replace(/\ /g, "&nbsp");
		//data = data.replace(/\n/g, "<br />");
		//data = data.toString().replace(/\r\n/g, "<br />");
		//res.send("<pre style='white-space:nowrap;white-space: pre-wrap;word-wrap: break-word;'><code>" + data + "</code></pre>");
		//res.send("<code style='white-space:nowrap'><pre style='width:auto;white-space:pre-wrap;word-wrap: break-word;'>" + data + "</pre></code>");
		res.send("<pre>" + data + "</pre>");
  		//res.setHeader('Content-Type', 'text/plain');
  		//res.setHeader('Content-Length', data.length);
  		//res.end(data);
	}
});
app.get(config.get('base_url') + 'download/*', function(req, res) {
	//Download File
	//Set Content-Disposition header to attachment and auto determint its Content-Type by its extension, then send the file
	path = "/" + req.params.toString();
	log("Download '" + path + "' from session " + req.sessionID);
	res.attachment(path);
	res.sendfile(path);
});
app.get(config.get('base_url') + 'tail/*', function(req, res) {
	//Tail File
	path = "/" + req.params.toString();
	log("Tail '" + path + "' from session " + req.sessionID);
	//set path to session to socket.io connect function can pick it up per client
	//reqired elseif connect uses global "path" variable, then users will stomp on each other, because path is global it gets set for every user
	//only way to persist data via each client is with sessions
	req.session.path = path;
	//res.sendfile(__dirname + '/public/html/tail.html');
	fs.readFile(__dirname + '/public/html/tail.html', 'utf8', function (err, text) {
		text = text.replace(/%connect_url%/g, config.get('connect_url'));
		text = text.replace(/%resource%/g, 'socket.io');
		res.send(text);
	});

});
app.use(config.get('base_url'), express.static(__dirname + '/public'));
app.use(config.get('base_url'), express.static(__dirname + '/public/html'));


//NOTICE.  I tried fw.watchFile and fs.watch
//fs.watch seems much faster and better, but does NOT work over NFS :(
//So I stuck with fw.watchFile


//Socket.io Events
io.sockets.on('connection', function (socket) {
	var hs = socket.handshake;
	var filePath = hs.session.path;
	var lastFilePath;

	log("Connected to '" + filePath + "' from session " + hs.sessionID + " on socket " + socket.id);
	
    unwatch();
	fs.stat(filePath, function(err, stats) {
		if (err) throw err;
		if (stats.size === 0) {
			//socket.emit('clear');
			return;
		}
		var start = (stats.size > backlog_size) ? (stats.size - backlog_size) : 0;
		streamData(filePath, start, stats.size, socket); //shows a few initial lines

		// Tail file now using fs.watchFile (not fs.watch)
		fs.watchFile(filePath, function(curr, prev) {
			if (socket) {
				if(prev.size > curr.size) return;
				log("Streaming '" + filePath + "' from session " + hs.sessionID + " to socket " + socket.id);
				streamData(filePath, prev.size, curr.size, socket);
				lastFilePath = filePath;
			}
		});
	});

	socket.on('disconnect', function () {
		log("Disconnected to '" + path + "' from session " + hs.sessionID + " on socket " + socket.id);
		unwatch();
		socket = undefined;
	});

	function unwatch() {
		lastFilePath && fs.unwatchFile(lastFilePath);
		lastFilePath = undefined;
	}

});


//Listen
server.listen(config.get('port'));
log('Server running in ' + app.get('env') + ' environment on port ' + config.get('port'));


//Stream Data
function streamData(fileName, start, end, socket) {
	if (socket) {
		var stream = fs.createReadStream(fileName, { 'start': start, 'end': end });
		stream.addListener("data", function(lines){
			if (lines.length == backlog_size) {
				lines = lines.toString('utf-8');
				lines = lines.slice(lines.indexOf("\n")+1).split("\n");
			} else {
				lines = lines.toString('utf-8').split("\n")
			}
			socket.emit('tail', lines);
		});
	}
}


//Logging
function log(data) {
	var now = new Date();
	now = dateFormat(now, "yyyy-mm-dd HH:MM:ss.l");
	util.puts(now + ' | ' + data);
}








/* This is using fw.watch which is super fast, but after all the work
	I realized it does NOT work over SMB or NFS
*/
/*
io.sockets.on('connection', function (socket) {
	var hs = socket.handshake;
	var filePath = hs.session.path;
	var currentWatcher;
	var currentFilesize;

	log("Connected to '" + filePath + "' from session " + hs.sessionID + " on socket " + socket.id);

	fs.stat(filePath, function (err, stat){
		if(currentWatcher)
			currentWatcher.close();

		if(err) {
			console.log(err);
			//socket.emit('error', err.toString());
			return;
		}

		currentFilesize = stat.size;

		var start = (stat.size > maxBuffer)?(stat.size - maxBuffer):0;
		var stream = fs.createReadStream(filePath, { start:start, end:stat.size } );
		//stream.addListener("error",function(err){
			//socket.emit('error', err.toString());
		//});
		stream.addListener("data", function(filedata){
			filedata = filedata.toString('utf-8');
			var lines;
			if(filedata.length >= maxBuffer){
				lines = filedata.slice(filedata.indexOf("\n")+1).split("\n");
			} else {
				lines = filedata.split("\n");
			}
			//socket.emit('initialTextData',{ text : lines, filename: data.filename});
			socket.emit('tail', lines);
			startWatching(filePath, socket);
			console.log('started watching '+ filePath);
		});
	});

	function startWatching(filename, socket) {
		currentWatcher = fs.watch(filename, function(event){
			fs.stat(filename, function(err,stat){
				if(err) {
					console.log(err);
					//socket.emit('error', err.toString());
					return;
				}
				if(currentFilesize > stat.size) {
					//socket.emit('fileReset',{filename:filename});
					currentFilesize = stat.size;
					return;
				}
				var stream = fs.createReadStream(filename, { start: currentFilesize, end: stat.size});
				//stream.addListener("error",function(err){
				//	socket.emit('error', err.toString());
				//});
				stream.addListener("data", function(filedata) {
					//socket.emit('continuousTextData',{ text : filedata.toString('utf-8').split("\n") });
					socket.emit('tail', filedata.toString('utf-8').split("\n"));
					currentFilesize = stat.size;
				});
			});
		});
	}
});
*/
