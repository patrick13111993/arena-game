'use strict';
let form = document.getElementById('form');
let input = document.getElementById('input');
let messagecontainer = document.getElementById('messages');
let messagepanel = document.getElementById('messagepanel');
let userlist = document.getElementById('userlist');
let regpanel = document.getElementById('regpanel');
let regform = document.getElementById('regform');
let regmessage = document.getElementById('regmessage');
let startgamebutton = document.getElementById('startgamebutton');
let chatroom = document.getElementById('chatroom');
let gamescreen = document.getElementById('game');
let activetarget="Everyone";
let activechat=null;

//Add chat message to lobby, or if another player's name has been clicked add a dm to that player
form.addEventListener('submit', function(e) {
    e.preventDefault();
    if(input.value) {
        if(!activechat) {
            socket.emit('chatmsg', input.value);
            appendMessage({nickname:'You', msg:input.value})
        } else {
            socket.emit('dm', {sockid:activechat, msg:input.value});
            let targetnick = document.getElementById('activetarget').innerHTML;
            appendMessage({nickname:'You to '+targetnick, msg:input.value})
        }
        input.value='';
        socket.emit('nottyping');
    }
});

//Attempt to register a nickname
regform.addEventListener('submit', (e) => {
    e.preventDefault();
    if(e.target.nickname.value) {
        let nickname = e.target.nickname.value;
        socket.emit('reguser', nickname);
    }
})

//Inform lobby that a user is typing
input.addEventListener('input', function(e) {
    if(input.value) {
        socket.emit('istyping');
    } else {
        socket.emit('nottyping');
    }
})

//Select a player to send a direct message to
userlist.addEventListener('click', (e) => {
    if(activechat) {
        activechat=null;
        document.getElementById('activetarget').innerHTML = 'Everyone';
    } else {
        if(e.target.id!=socket.id) {
            activechat=e.target.id;
            document.getElementById('activetarget').innerHTML = e.target.attributes.name.value;
        }
    }
})

//Inform server that a user is ready
startgamebutton.addEventListener('click', (e) => {
    socket.emit('playerready');
});

//Inform server that a user is typing
socket.on('istyping', (sockid) => {
    let useritem = document.getElementById(sockid);
    useritem.innerHTML = useritem.attributes.name.value+" is typing...";
});

//Inform server that a user has stopped typing
socket.on('nottyping', (sockid) => {
    let useritem = document.getElementById(sockid);
    useritem.innerHTML = useritem.attributes.name.value;
});

//Append chat message to lobby chat
socket.on('chatmsg', (msg) => {
    appendMessage(msg);
});

//Append direct message to lobby chat for intended user
socket.on('dm', (msg) => {
    appendMessage({nickname:'from '+msg.nickname,msg:msg.msg});
});

// Update list of connected users
socket.on('connectionlist', (connections) => {
    let outputhtml = '';
    //this next line appears redundant but removing it breaks everything
    userlist = document.getElementById('userlist');
    for(let i in connections) {
        outputhtml+='<li name="'+connections[i].nickname+'" id="'+connections[i].sock+'">'+connections[i].nickname+'</li>';
    }
    userlist.innerHTML = outputhtml;
});

//Inform lobby that a user has disconnected
socket.on('usergone', (usernick) => {
    appendMessage({nickname:usernick,msg:' disconnected'});
});

//Inform lobby that a user has registered
socket.on('userregistered', (usernick) => {
    appendMessage({nickname:usernick,msg:' connected'});
});

//Inform user that lobby is full. Occurs if 4 clients are already connected
socket.on('lobbyfull', () => {
    regform.remove();
    form.remove();
    messagepanel.style.display="block";
    regmessage.innerHTML="Lobby is full!";
});

//Display number of players ready
socket.on('waitingplayers', (msg) => {
    let numplayers = 4-msg;
    let playerstring = "player";
    if(numplayers!==1) {
        playerstring+="s";
    }
    startgamebutton.innerText = "Waiting on " + numplayers.toString() + " " + playerstring + "...";
    if(numplayers==0) {
        socket.emit('startgame');
    }
});

//Inform user that name already exists
socket.on('nameexists', () => {
    alert("Username already exists!");
});

//Hide registration page, display chat panel
socket.on('uniquename', () => {
    regform.style.display="none";
    messagepanel.style.display="block";
    regmessage.style.display="none";
})

//Hide chatroom, show game screen, initiate easeljs loop and assign a ship to each player
socket.on('startgame', () => {
    chatroom.hidden=true;
    gamescreen.hidden=false;
    init();
    socket.emit('assignship',socket.id);
});

//Append message to lobby
function appendMessage(msg) {
    messagecontainer = document.getElementById("messages");
    let listitem = document.createElement('li');
    listitem.textContent = msg.nickname + ": " + msg.msg;
    listitem.className = "chatmessage";
    let listLi = document.querySelectorAll(".chatmessage");
    if(listLi.length > 6) {
        messagecontainer.removeChild(messagecontainer.childNodes[0]);
    }
    messagecontainer.appendChild(listitem);
}

/***
 * Uncomment this line + bottom line in index.js to skip lobby
 */
// socket.emit('startgame');