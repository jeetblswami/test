var app = require('express')();
var fs=require('fs');
var https = require('https').createServer({
    key: fs.readFileSync('./server.key'),
    cert: fs.readFileSync('./server.crt'),
    ca: fs.readFileSync('./ca.crt'),
    requestCert: true,
    rejectUnauthorized: false
}, app).listen('8443', function() {
    console.log("Secure Express server listening on port 8443");
});
var io = require('socket.io')(https);
app.get('/', function(req, res){
  res.sendFile(__dirname+'/index.html');
});
app.get('/index.html', function(req, res){
  res.sendFile(__dirname+'/index.html');
});
app.get('/main.js', function(req, res){
  res.sendFile(__dirname+'/main.js');
});
app.get('/adapter.js', function(req, res){
  res.sendFile(__dirname+'/adapter.js');
});
io.use(function (socket, next) {
    var queryParams = socket.handshake.query;
    if (queryParams.roomId) {
        socket.roomId = queryParams.roomId;
    }
    next();
});
io.sockets.on('connection', function (socket) {
    console.info("got new connection");
     if (!(socket.roomId)) {
        console.info("Not enough information for socket disconnecting");
        socket.disconnect();
        return;
    }
    socket.join(socket.roomId);
    socket.emit("connected", {userId:new Date().getTime()+""+Math.random()});
    socket.on("data", function (message) {
        console.log("Room:"+socket.roomId+"  got message:"+JSON.stringify(message));
        if (message) {
            socket.broadcast.to(socket.roomId).emit("data",message);
        }
    });
     socket.on("disconnect", function () {
            socket.broadcast.to(socket.roomId).emit("data",{type:'end'});
    });
});
