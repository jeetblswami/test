var app = angular.module('myApp', []);
app.controller('testAvCall', function ($scope, $timeout) {
    $scope.isCallActive = false;
    $scope.isCallDisabled = false;
    $scope.AECenabled = true;
    $scope.AGCenabled = true;
    $scope.DSCPenabled = true;
    $scope.CodecPref = "None";
    $scope.browser = webrtcDetectedBrowser;
    
    var peerConnection = false;
    var userId;
    var roomId;
    var localStream = false;
    var canAddCandidates=true;
    var candidatesStore=[];
    function getRoomId() {
        roomId = getParameterByName('roomId');
//        roomId = 1234;
        if (!roomId || roomId == "") {
            roomId = prompt("Please enter roomId", "test");
        }
        localVideo = document.getElementById('localVideo');
        remoteVideo = document.getElementById('remoteVideo');
        var params = {
            'force new connection': true,
            query: {
                roomId: roomId
            },
            transports: ["websocket"],
            upgrade: false,
            'sync disconnect on unload': true
        };
        server = window.location.href;
        socket = io(server, params);
        socket.on("connected", function (data) {
            userId = data.userId;
        });
        socket.on('data', gotMessageFromServer);
        getUserMediaTry(function () {});
    }
    function getUserMediaSuccess(stream) {
        if (localStream) {
            var tracks = localStream.getTracks();
            for (var i in tracks) {
                tracks[i].stop();
            }
            localStream = null;
        }
        localStream = stream;
        localVideo.src = window.URL.createObjectURL(stream);
    }
    function getUserMediaTry(callBack) {
        var constraints;
        if (webrtcDetectedBrowser == 'firefox') {
            constraints = {
                video: true,
                audio: {
                    mandatory: {
                        echoCancellation: $scope.AECenabled
                    }
                }
            };
        } else {
            constraints = {
                video: true,
                audio: {
                    mandatory: {
                        googEchoCancellation: $scope.AECenabled,
                        googAutoGainControl: $scope.AGCenabled
                    }
                }
            };
        }
        if (navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
                getUserMediaSuccess(stream);
                callBack(stream);
            }).
                    catch(errorHandler);
        } else {
            alert('Your browser does not support getUserMedia API');
        }
    }
    $scope.startCall = function (isCaller, cb) {
        $timeout(function () {
            $scope.isCallActive = true;
        });

        var iceServers = [];
        for (var i = 0; i < servers.length; ++i) {
            iceServers.push(JSON.parse(servers[i].value));
        }
        var peerConnectionConfig = {
            'iceServers': iceServers
        };
        var pcConstraints;
        if (webrtcDetectedBrowser == 'chrome') {
            pcConstraints = {'mandatory': {googDscp: $scope.DSCPenabled}};
        }
        peerConnection = new RTCPeerConnection(peerConnectionConfig, pcConstraints);
        peerConnection.onicecandidate = gotIceCandidate;
        peerConnection.onaddstream = gotRemoteStream;

        peerConnection.oniceconnectionstatechange = icestatechanged;
        getUserMediaTry(function (stream) {
            peerConnection.addStream(stream);
            if (isCaller) {
                peerConnection.createOffer().then(createdDescription).
                        catch(errorHandler);
            } else {
                cb();
            }
        });
    };

    function icestatechanged() {
        if (!peerConnection) {
            return;
        }
        var iceConnectionState = peerConnection.iceConnectionState;
        switch (iceConnectionState) {
            case 'new':
                break;
            case 'checking':
                break;
            case 'connected':
                break;
            case 'completed':
                break;
            case 'failed':
                $scope.stopCall(true, true);
                break;
            case 'disconnected':
                break;
            case 'closed':
                peerConnection = false;
                $scope.stopCall(true, false);
                break;
        }
    }

    function gotMessageFromServer(message) {

        var signal = message;
        if (signal.userId == userId)
            return;

        if (signal.type == 'sdp') {
            if (!peerConnection && signal.sdp.type == 'offer') {
                canAddCandidates=false;
                $scope.startCall(false, function(){
                    peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function () {
                        peerConnection.createAnswer().then(createdDescription).
                                catch(errorHandler);
                }).catch(errorHandler);
                });
            }else{
                peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function () {
                }).catch(errorHandler);
            }

        } else if (signal.type == 'ice') {
            if(canAddCandidates){
            peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice)).
                    catch(errorHandler);
            }else{
                candidatesStore.push(signal.ice);
            }
        } else if (signal.type == 'end') {
            $scope.stopCall(false);
        }
    }

    function gotIceCandidate(event) {
        if (event.candidate != null) {
            socket.emit("data", ({
                'ice': event.candidate,
                'userId': userId,
                'type': 'ice'
            }));
        }
    }
    function drainCandidates(){
        for(var i in candidatesStore){
        peerConnection.addIceCandidate(new RTCIceCandidate(candidatesStore[i])).
                    catch(errorHandler);
        }
        candidatesStore=[];
    }

    function createdDescription(description) {
        if (description.type == "offer") {
            description.sdp = processSdp(description.sdp);
        }
        peerConnection.setLocalDescription(description).then(function () {
            canAddCandidates=true;
            drainCandidates();
            socket.emit('data', ({
                'sdp': peerConnection.localDescription,
                'userId': userId,
                'type': 'sdp'
            }));
        }).
                catch(errorHandler);
    }

    function processSdp(sdp) {
        var allowedCodes;
        switch ($scope.CodecPref) {
            case "None":
                return sdp;
                break;
            case "OPUS":
                allowedCodes = ["OPUS"];
                break;
            case "OPUS/PCMU":
                allowedCodes = ["OPUS", "PCMU"];
                break;
            case "PCMU":
                allowedCodes = ["PCMU"];
                break;
            case "PCMU/OPUS":
                allowedCodes = ["PCMU", "OPUS"];
                break;
        }
        var oldMainLine = sdp.substring(sdp.indexOf('UDP/TLS/RTP/SAVPF'), sdp.indexOf('\r\n', sdp.indexOf('UDP/TLS/RTP/SAVPF')));
        var oldInfoLine = sdp.substring(sdp.indexOf('a=rtpmap:'), sdp.indexOf('\r\n', sdp.lastIndexOf('a=rtpmap:')) + 2);
        var codecs = oldMainLine.split(' ');
        codecs.shift();
        var codecInfo = [];
        for (var i = 0; i < (codecs.length); i++) {
            var indexStr = 'a=rtpmap:' + codecs[i] + ' ';
            var firstIndex = sdp.indexOf(indexStr);
            var codecName = sdp.substring(firstIndex + indexStr.length, sdp.indexOf('/', firstIndex + indexStr.length));
            var codecLine = (i == (codecs.length - 1)) ? sdp.substring(firstIndex, sdp.indexOf('\r\n', firstIndex) + 2) : sdp.substring(firstIndex, sdp.indexOf('a=rtpmap', firstIndex));
            codecInfo.push({
                codecNo: codecs[i],
                codecName: codecName,
                codecLine: ((sdp.substring(sdp.indexOf('rtpmap:' + codecs[i] + ' ') + 8 + codecs[i].length, sdp.indexOf('/', sdp.indexOf('rtpmap:' + codecs[i] + ' ')))) != 'opus') ? sdp.substring(sdp.indexOf('a=rtpmap:' + codecs[i] + ' '), sdp.indexOf('\r\n', sdp.indexOf('rtpmap:' + codecs[i] + ' ')) + 2) : sdp.substring(sdp.indexOf('a=rtpmap:' + codecs[i] + ' '), sdp.indexOf('a=rtpmap', sdp.indexOf('rtpmap:' + codecs[i] + ' ')))
            });
        }
        ;
        var codecToInsert = [];
        for (var i = 0; i < (codecInfo.length); i++) {
            var index = allowedCodes.indexOf((codecInfo[i].codecName).toUpperCase());
            if (index > -1) {
                if (!codecToInsert[index]) {
                    codecToInsert[index] = codecInfo[i];
                } else {
                    for (var j = ((codecToInsert.length - 1)); j >= 0; j--) {
                        if ((codecToInsert[j].codecName.indexOf((codecInfo[i].codecName).toUpperCase()) > -1)) {
                            codecToInsert.splice((j + 1), 0, codecInfo[i]);
                            break;
                        } else if ((j == 0)) {
                            codecToInsert.splice((codecToInsert.length), 0, codecInfo[i]);
                            break;
                        }
                    }
                }
            }
        }
        ;
        var newMainLine = "UDP/TLS/RTP/SAVPF";
        var newInfoLine = "";
        for (var i = 0; i < (codecToInsert.length); i++) {
            newMainLine += " " + codecToInsert[i].codecNo;
            newInfoLine += codecToInsert[i].codecLine;
        }
        newsdp = sdp.replace(oldMainLine, newMainLine).replace(oldInfoLine, newInfoLine);
        return newsdp;
    }

    function gotRemoteStream(event) {
        console.log("??????????????????");
        remoteVideo.src = window.URL.createObjectURL(event.stream);
    }

    function errorHandler(error) {
        console.log(error);
        peerConnection = false;
        $scope.stopCall(true, true);
    }
    $scope.stopCall = function (send, error) {
        if (peerConnection) {
            peerConnection.close();
        }
        if (error) {
            alert("there were some error in call check your settings");
        } else if ($scope.isCallActive) {
            alert("call got ended");
        }
        peerConnection = false;
        $timeout(function () {
            $scope.isCallActive = false;
        });
        if (send) {
            socket.emit("data", {
                type: 'end'
            });
        }
    };

    function getParameterByName(name) {
        var url = window.location.href;
        name = name.replace(/[\[\]]/g, "\\$&");
        var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
                results = regex.exec(url);
        if (!results)
            return null;
        if (!results[2])
            return '';
        return decodeURIComponent(results[2].replace(/\+/g, " "));
    }
    getRoomId();

});

var passwordInput = document.querySelector('input#password');
var removeButton = document.querySelector('button#remove');
var servers = document.querySelector('select#servers');
var urlInput = document.querySelector('input#url');
var usernameInput = document.querySelector('input#username');
var addButton = document.querySelector('button#add');

var selectServer = function (event) {
    var option = event.target;
    var value = JSON.parse(option.value);
    urlInput.value = value.urls[0];
    usernameInput.value = value.username || '';
    passwordInput.value = value.credential || '';
};

function addServer() {
    var scheme = urlInput.value.split(':')[0];
    if (scheme !== 'stun' && scheme !== 'turn' && scheme !== 'turns') {
        alert('URI scheme ' + scheme + ' is not valid');
        return;
    }
    var option = document.createElement('option');
    var iceServer = {
        urls: [urlInput.value],
        username: usernameInput.value,
        credential: passwordInput.value
    };
    option.value = JSON.stringify(iceServer);
    option.text = urlInput.value + ' ';
    var username = usernameInput.value;
    var password = passwordInput.value;
    if (username || password) {
        option.text += (' [' + username + ':' + password + ']');
    }
    option.ondblclick = selectServer;
    servers.add(option);
    urlInput.value = usernameInput.value = passwordInput.value = '';
}

function removeServer() {
    for (var i = servers.options.length - 1; i >= 0; --i) {
        if (servers.options[i].selected) {
            servers.remove(i);
        }
    }
}