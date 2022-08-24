'use strict';
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const Box2D = require('box2dweb-commonjs').Box2D;

let b2Vec2 = Box2D.Common.Math.b2Vec2;
let b2AABB = Box2D.Collision.b2AABB;
let b2BodyDef = Box2D.Dynamics.b2BodyDef;
let b2Body = Box2D.Dynamics.b2Body;
let b2FixtureDef = Box2D.Dynamics.b2FixtureDef;
let b2Fixture = Box2D.Dynamics.b2Fixture;
let b2World = Box2D.Dynamics.b2World;
let b2MassData = Box2D.Collision.Shapes.b2MassData;
let b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape;
let b2CircleShape = Box2D.Collision.Shapes.b2CircleShape;
let b2DebugDraw = Box2D.Dynamics.b2DebugDraw;
let b2MouseJointDef = Box2D.Dynamics.Joints.b2MouseJointDef;
let b2EdgeShape = Box2D.Collision.Shapes.b2EdgeShape;
let listener = new Box2D.Dynamics.b2ContactListener();

let connections = [];
let world, interval;
let players = [];
const SCALE = 30;
const WIDTH = 900;
const HEIGHT = 500;
const size = 50;
let fps = 60;
let keyhit = false;
let playersready = [];
let playersregistered = 0;
let gamerunning = false;
let destroylist = [];
let score = 0;
let playersalive = 0;

let b2dobjects = require('./json/b2dobjects.json');

/***
 * Create a Box2D object. Parameters must include: friction, density, restitution, objid, istatic, iscircle
 * @param x
 * @param y
 * @param width
 * @param height
 * @param parameters
 * @returns {*}
 */
function createAnObject(x, y, width, height, parameters) {
    let bodyDef = new b2BodyDef;
    bodyDef.type = parameters.isstatic ? b2Body.b2_staticBody : b2Body.b2_dynamicBody;
    bodyDef.position.x = x / SCALE;
    bodyDef.position.y = y / SCALE;

    let fixDef = new b2FixtureDef;
    fixDef.density = parameters.density;
    fixDef.friction = parameters.friction;
    fixDef.restitution = parameters.restitution;

    let objwidth, objheight;

    if (parameters.iscircle) {
        let radius = width / 2;
        fixDef.shape = new b2CircleShape(radius / SCALE);
        objwidth = objheight = width;
    } else { //rectangle
        fixDef.shape = new b2PolygonShape;
        fixDef.shape.SetAsBox(width / SCALE, height / SCALE);
        objwidth = width;
        objheight = height;
    }
    let thisobj = world.CreateBody(bodyDef).CreateFixture(fixDef);
    let userdata = ({
        objid: parameters.objid,
        width: objwidth,
        height: objheight,
        iscircle: parameters.iscircle
    });
    if (parameters.objid.includes('player')) {
        userdata.sockid = "";
    }
    thisobj.GetBody().SetUserData(userdata);
    return thisobj;
}

/***
 * Create an object instance to send to the client
 * @returns {*[]}
 */
function drawDOMObjects() {
    let ret = [];
    for (let b = world.GetBodyList(); b; b = b.GetNext()) {
        for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
            if (f.GetBody().GetUserData()) {
                let objid = f.GetBody().GetUserData().objid;
                let x = Math.round(f.GetBody().GetPosition().x * SCALE);
                let y = Math.round(f.GetBody().GetPosition().y * SCALE);
                let r = Math.round(f.GetBody().GetAngle() * 100) / 100;
                let iscircle = f.GetBody().GetUserData().iscircle;
                let objwidth = Math.round(f.GetBody().GetUserData().width);
                let objheight = Math.round(f.GetBody().GetUserData().height);

                ret.push({
                    objid: objid,
                    x: x,
                    y: y,
                    r: r,
                    iscircle: iscircle,
                    objwidth: objwidth,
                    objheight: objheight
                });
            }
        }
    }
    return ret;
}

/***
 * Destroy all items in the destroylist, update all DOM elements
 */
function update() {
    world.Step(
        1 / fps,
        10,
        10
    );

    destroyList();
    io.sockets.emit('objdata', drawDOMObjects())
    world.ClearForces();
}

/***
 * Initialise the Box2D world and create all initial objects (walls, players). Begin asteroid creation loop
 */
function init() {
    gamerunning = true;
    playersalive = 4;
    world = new b2World(
        new b2Vec2(0, 0),
        true
    );

    let wallparams = b2dobjects.find(({name}) => name === 'wall').parameters;
    let playerparams = b2dobjects.find(({name}) => name === 'player').parameters;

    wallparams.objid = "ceiling";
    createAnObject(0, 0, WIDTH, 5, wallparams);
    wallparams.objid = "ground";
    createAnObject(0, HEIGHT, WIDTH, 5, wallparams);
    wallparams.objid = "leftwall";
    createAnObject(0, 0, 5, HEIGHT, wallparams);
    wallparams.objid = "rightwall";
    createAnObject(WIDTH, 0, 5, HEIGHT, wallparams);

    let playerx = 450;
    let playery = 100;
    for (let i = 0; i < 4; i++) {
        playerparams.objid = "player" + (i + 1).toString();
        let playerobj = createAnObject(playerx, playery, 20, 20, playerparams);
        playery += 100;
    }

    createAsteroid();
    initListener();

    interval = setInterval(() => {
        update();
    }, 1000 / fps);
    update();
}

/***
 * Destroy all objects in destroyList. Inform client which objects are being destroyed
 */
function destroyList() {
    for (let i in destroylist) {
        io.sockets.emit('destroy', destroylist[i].GetUserData().objid);
        world.DestroyBody(destroylist[i]);
    }
    destroylist.length = 0;
}

/***
 * Asteroid creation loop. Create an asteroid of random size between 10 and 50, in a random location along the right side of the screen
 */
function createAsteroid() {
    let rand1 = Math.random();
    let rand2 = Math.random();
    let rand3 = Math.random();
    let asteroidinterval = 1000 + Math.round(rand1 * 3000);
    let asteroidsize = Math.round(10 + (rand2 * 40));
    let y = 50 + (rand1 * 400);
    let xspeed = 0.5 + (rand2 * 1.5);
    let yspeed = rand3 - 0.5;
    let asteroid = createAnObject(850, y, asteroidsize, asteroidsize, {
        "density": 1.0,
        "friction": 0.2,
        "restitution": 1.0,
        "isstatic": false,
        "iscircle": true,
        "objid": "asteroid" + asteroidinterval.toString()
    });
    let userdata = asteroid.GetBody().GetUserData();
    userdata.currenthealth = asteroidsize;
    userdata.totalhealth = asteroidsize;
    asteroid.GetBody().SetUserData(userdata);
    asteroid.GetBody().SetLinearVelocity(new b2Vec2(-xspeed, -yspeed));
    for (let b = world.GetBodyList(); b; b = b.GetNext()) {
        for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
            let found = false;
            if (f.GetBody().GetUserData()) {
                if (f.GetBody().GetUserData().objid === asteroid.GetBody().GetUserData().objid && found === true) {
                    let userdata = asteroid.GetBody().GetUserData();
                    userdata.objid = asteroid.GetBody().GetUserData().objid + "dupe";
                    asteroid.GetBody().SetUserData(userdata);
                }
                if (f.GetBody().GetUserData().objid === asteroid.GetBody().GetUserData().objid) {
                    found = true;
                }
            }
        }
    }
    //Create next asteroid
    loop("asteroid", asteroidinterval);
}

/***
 * Expandable loop function for addition of other game objects such as enemies
 * @param type
 * @param loopinterval
 */
function loop(type = null, loopinterval = 1000) {
    if (gamerunning == true) {
        switch (type) {
            case "asteroid":
                setTimeout(createAsteroid, loopinterval);
                break;
            // case "enemy":
            //     setTimeout(createEnemy, loopinterval);
            //     break;
        }
    }
}

/***
 * Check if there are players remaining on the field, if none remain end the game
 */
function checkGameStatus() {
    if (playersalive == 0) {
        endGame();
    }
}

/***
 * Stop the game and inform the client that the game has ended
 */
function endGame() {
    gamerunning = false;
    io.sockets.emit('endgame');
}

app.use(express.static('public'));
app.use('/assets', express.static(__dirname + 'public/json'));
app.use('/css', express.static(__dirname + 'public/json'));
app.use('/json', express.static(__dirname + 'public/json'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

http.listen(8000, () => {
    console.log('server up on *:8000');

    //Client connected, send updated list of clients to clients. If 4 are already connected, inform the client
    io.on('connection', (socket) => {
        if (connections.length < 4) {
            let nickname = "Anonymous";
            for (let i = 0; i < connections.length; i++) {
                if (connections[i].nickname == nickname) {
                    nickname += (connections.length).toString();
                }
            }
            connections.push({sock: socket.id, nickname: nickname});
            io.sockets.emit('connectionlist', connections);
        } else {
            socket.emit('lobbyfull');
        }

        //Client disconnected, update list of registered players and players waiting to start a game. Inform client of disconnection
        socket.on('disconnect', () => {
            console.log(socket.id + " disconnected");
            let i = connections.findIndex(element => element.sock == socket.id);
            if (typeof connections[i] !== "undefined" && connections[i] !== null) {
                if (!connections[i].nickname.includes("Anonymous")) {
                    playersregistered--;
                }
                ;
                if (!playersready.includes(connections[i])) {
                    playersready.splice((playersready.indexOf(connections[i])), 1);
                    io.sockets.emit('waitingplayers', playersready.length);
                }
                ;
                socket.broadcast.emit('usergone', connections[i].nickname);
                for (let x = 0; x < connections.length; x++) {
                    if (connections[x].sock == socket.id) {
                        connections.splice(x, 1);
                    }
                }
                socket.broadcast.emit('connectionlist', connections);
            }
        });

        //Check if nickname is unique, if it is register player and send client updated information
        socket.on('reguser', (nickname) => {
            let nameexists = false;
            for (let i = 0; i < connections.length; i++) {
                if (connections[i].nickname == nickname) {
                    nameexists = true;
                }
            }
            if (!nameexists) {
                let i = connections.findIndex(element => element.sock == socket.id);
                connections[i].nickname = nickname;
                socket.emit('uniquename');
                io.sockets.emit('connectionlist', connections);
                socket.broadcast.emit('userregistered', nickname);
                playersregistered++;
            } else {
                socket.emit('nameexists');
            }
        });

        //Assign chat message to user nickname and feed back to clients
        socket.on('chatmsg', (msg) => {
            let i = connections.findIndex(element => element.sock == socket.id);
            let nickname = connections[i].nickname;
            socket.broadcast.emit('chatmsg', {nickname: nickname, msg: msg});
        });

        //Send chat message to target of direct message
        socket.on('dm', (msg) => {
            let i = connections.findIndex(element => element.sock == socket.id);
            let nickname = connections[i].nickname;
            io.to(msg.sockid).emit('dm', {nickname: nickname, msg: msg.msg});
        });

        //Return user's socketid to client
        socket.on('istyping', (msg) => {
            socket.broadcast.emit('istyping', socket.id);
        });

        //Return user's socketid to client
        socket.on('nottyping', (msg) => {
            socket.broadcast.emit('nottyping', socket.id);
        });

        //Add player to playersready array upon clicking start game button
        socket.on('playerready', (msg) => {
            let i = connections.findIndex(element => element.sock == socket.id);
            if (!playersready.includes(i)) {
                playersready.push(i);
                io.sockets.emit('waitingplayers', playersready.length);
            }
            ;
        });

        //Initiate Box2D world and begin game loop
        socket.on('startgame', () => {
            players = playersready;
            init();
            io.sockets.emit('startgame');
        })

        //Assign a ship to each player
        socket.on('assignship', (sockid) => {
            let assigned = false;
            while (!assigned) {
                for (let b = world.GetBodyList(); b; b = b.GetNext()) {
                    for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
                        if (f.GetBody().GetUserData().sockid == sockid) {
                            assigned = true;
                            return;
                        }
                    }
                }
                for (let b = world.GetBodyList(); b; b = b.GetNext()) {
                    for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
                        if (f.GetBody().GetUserData().objid.includes('player')) {
                            if (f.GetBody().GetUserData().sockid == "") {
                                let userdata = f.GetBody().GetUserData();
                                userdata.sockid = sockid;
                                f.GetBody().SetUserData(userdata);
                                assigned = true;
                                return;
                            }
                        }
                    }
                }
                assigned = true;
            }
        });

        //Player controls. Find player's ship then use switch statement to determine action based on key input
        socket.on('keydown', (msg) => {
            let ship = null;
            if (gamerunning) {
                for (let b = world.GetBodyList(); b; b = b.GetNext()) {
                    for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
                        if (f.GetBody().GetUserData().objid.includes('player')) {
                            if (f.GetBody().GetUserData().sockid == msg.sockid) {
                                ship = f;
                            }
                        }
                    }
                }
                if (ship !== null) {
                    switch (msg.keyCode) {
                        case 65:
                        case 37:
                            ship.GetBody().ApplyImpulse(new b2Vec2(-5, 0), ship.GetBody().GetWorldCenter())
                            if (ship.GetBody().GetLinearVelocity().x < 5) {
                                ship.GetBody().SetLinearVelocity(new b2Vec2(-5, ship.GetBody().GetLinearVelocity().y))
                            }
                            break;
                        case 68:
                        case 39:
                            ship.GetBody().ApplyImpulse(new b2Vec2(5, 0), ship.GetBody().GetWorldCenter())
                            if (ship.GetBody().GetLinearVelocity().x > 5) {
                                ship.GetBody().SetLinearVelocity(new b2Vec2(5, ship.GetBody().GetLinearVelocity().y))
                            }
                            break;
                        case 87:
                        case 38:
                            ship.GetBody().ApplyImpulse(new b2Vec2(0, -3), ship.GetBody().GetWorldCenter())
                            if (ship.GetBody().GetLinearVelocity().y < -3) {
                                ship.GetBody().SetLinearVelocity(new b2Vec2(ship.GetBody().GetLinearVelocity().x, -3))
                            }
                            break;
                        case 83:
                        case 40:
                            ship.GetBody().ApplyImpulse(new b2Vec2(0, 3), ship.GetBody().GetWorldCenter())
                            if (ship.GetBody().GetLinearVelocity().y > 3) {
                                ship.GetBody().SetLinearVelocity(new b2Vec2(ship.GetBody().GetLinearVelocity().x, 3))
                            }
                            break;
                        case 32:
                            shoot(msg.sockid);
                            break;
                        default:
                            return;
                    }
                }
            }
        });

        //Player controls. Cancel movement on keyup
        socket.on('keyup', (msg) => {
            let ship = null;
            if (gamerunning) {
                for (let b = world.GetBodyList(); b; b = b.GetNext()) {
                    for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
                        if (f.GetBody().GetUserData().objid.includes('player')) {
                            if (f.GetBody().GetUserData().sockid == msg.sockid) {
                                ship = f;
                            }
                        }
                    }
                }
                if (ship !== null) {
                    switch (msg.keyCode) {
                        case 65:
                        case 37:
                        case 68:
                        case 39:
                            ship.GetBody().SetLinearVelocity(new b2Vec2(0, ship.GetBody().GetLinearVelocity().y))
                            break;
                        case 87:
                        case 38:
                        case 83:
                        case 40:
                            ship.GetBody().SetLinearVelocity(new b2Vec2(ship.GetBody().GetLinearVelocity().x, 0))
                            break;
                        default:
                            return;
                    }
                }
            }
        });

        /***
         * Shoot a laser to the right from a player's position
         * @param playerid
         */
        function shoot(playerid) {
            let player = null;
            for (let b = world.GetBodyList(); b; b = b.GetNext()) {
                for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
                    if (f.GetBody().GetUserData().objid.includes('player')) {
                        if (playerid == f.GetBody().GetUserData().sockid) {
                            player = f;
                        }
                    }
                }
            }
            let bodyx = player.GetBody().GetPosition().x * SCALE;
            let bodyy = player.GetBody().GetPosition().y * SCALE;
            let radius = 1;
            let uniqueno = 0;
            for (let b = world.GetBodyList(); b; b = b.GetNext()) {
                for (let f = b.GetFixtureList(); f; f = f.GetNext()) {
                    if (f.GetBody().GetUserData().objid.includes("laser")) {
                        uniqueno++;
                    }
                }
            }
            let uniquename = "laser" + uniqueno.toString();
            let laser = createAnObject(bodyx + 15, bodyy, 1, 1, {
                "density": 0,
                "friction": 0,
                "restitution": 0,
                "isstatic": false,
                "iscircle": true,
                "objid": uniquename
            });
            let userdata = laser.GetBody().GetUserData();
            userdata.damage=15;
            laser.GetBody().SetUserData(userdata);
            laser.GetBody().SetLinearVelocity(new b2Vec2(8, 0));
            io.sockets.emit('shoot', player.GetBody().GetUserData().sockid);
        }
    });
})

/***
 * Collision functionality
 */

function initListener() {
    world.SetContactListener(listener);
}

/***
 * Listener logic
 */

listener.BeginContact = function (contact) {
    let fixa = contact.GetFixtureA().GetBody().GetUserData();
    let fixb = contact.GetFixtureB().GetBody().GetUserData();
    if (fixa.objid.includes("asteroid") && fixb.objid == "leftwall") {
        destroylist.push(contact.GetFixtureA().GetBody());
    }
    if (fixa.objid == "leftwall" && fixb.objid.includes("asteroid")) {
        destroylist.push(contact.GetFixtureB().GetBody());
    }

    if (fixa.objid.includes("asteroid") && fixb.objid == "rightwall") {
        contact.GetFixtureA().GetBody().ApplyImpulse(new b2Vec2(-1, 0), contact.GetFixtureA().GetBody().GetWorldCenter());
    }
    if (fixa.objid == "rightwall" && fixb.objid.includes("asteroid")) {
        contact.GetFixtureB().GetBody().ApplyImpulse(new b2Vec2(-1, 0), contact.GetFixtureB().GetBody().GetWorldCenter());
    }

    if (fixa.objid.includes("asteroid") && fixb.objid == "ceiling") {
        contact.GetFixtureA().GetBody().SetLinearVelocity(new b2Vec2(contact.GetFixtureA().GetBody().GetLinearVelocity().x, 0.25));
    }
    if (fixa.objid == "ceiling" && fixb.objid.includes("asteroid")) {
        contact.GetFixtureB().GetBody().SetLinearVelocity(new b2Vec2(contact.GetFixtureB().GetBody().GetLinearVelocity().x, 0.25));
    }

    if (fixa.objid.includes("asteroid") && fixb.objid == "ground") {
        contact.GetFixtureA().GetBody().SetLinearVelocity(new b2Vec2(contact.GetFixtureA().GetBody().GetLinearVelocity().x, -0.25));
    }
    if (fixa.objid == "ground" && fixb.objid.includes("asteroid")) {
        contact.GetFixtureB().GetBody().SetLinearVelocity(new b2Vec2(contact.GetFixtureB().GetBody().GetLinearVelocity().x, -0.25));
    }

    if (fixa.objid.includes("asteroid") && fixb.objid.includes("player")) {
        io.sockets.emit('explosion', ({"x":contact.GetFixtureB().GetBody().GetPosition().x, "y":contact.GetFixtureB().GetBody().GetPosition().y, "size":10}));
        destroylist.push(contact.GetFixtureB().GetBody());
        playersalive--;
        checkGameStatus();
    }
    if (fixa.objid.includes("player") && fixb.objid.includes("asteroid")) {
        io.sockets.emit('explosion', ({"x":contact.GetFixtureA().GetBody().GetPosition().x, "y":contact.GetFixtureA().GetBody().GetPosition().y, "size":10}));
        destroylist.push(contact.GetFixtureA().GetBody());
        playersalive--;
        checkGameStatus();
    }

    if (fixa.objid.includes("laser")){
        destroylist.push(contact.GetFixtureA().GetBody());
        io.sockets.emit('explosion', ({"x":contact.GetFixtureA().GetBody().GetPosition().x, "y":contact.GetFixtureA().GetBody().GetPosition().y, "size":10}));
    }

    if (fixb.objid.includes("laser")){
        destroylist.push(contact.GetFixtureB().GetBody());
        io.sockets.emit('explosion', ({"x":contact.GetFixtureB().GetBody().GetPosition().x, "y":contact.GetFixtureB().GetBody().GetPosition().y, "size":10}));
    }
}

listener.PostSolve = function (contact, impulse) {
    let fixa = contact.GetFixtureA().GetBody().GetUserData();
    let fixb = contact.GetFixtureB().GetBody().GetUserData();
    if (fixa.objid.includes("laser") && fixb.objid.includes("asteroid")) {
        let currenthealth = fixb.currenthealth;
        currenthealth -= fixa.damage;
        if (currenthealth <= 0) {
            score += fixb.totalhealth;
            io.sockets.emit('updatescore', score);
            io.sockets.emit('explosion', ({"x":contact.GetFixtureB().GetBody().GetPosition().x, "y":contact.GetFixtureB().GetBody().GetPosition().y, "size":fixb.totalhealth/2}));
            destroylist.push(contact.GetFixtureB().GetBody());
        } else {
            fixb.currenthealth = currenthealth;
            contact.GetFixtureB().GetBody().SetUserData(fixb);
        }
    }
    if (fixa.objid.includes("asteroid") && fixb.objid.includes("laser")) {
        let currenthealth = fixa.currenthealth;
        currenthealth -= fixb.damage;
        if (currenthealth <= 0) {
            score += fixa.totalhealth;
            io.sockets.emit('updatescore', score);
            io.sockets.emit('explosion', ({"x":contact.GetFixtureA().GetBody().GetPosition().x,"y":contact.GetFixtureA().GetBody().GetPosition().y, "size":fixa.totalhealth/2}));
            destroylist.push(contact.GetFixtureA().GetBody());
        } else {
            fixa.currenthealth = currenthealth;
            contact.GetFixtureA().GetBody().SetUserData(fixa);
        }
    }
}

/***
 * Uncomment this line + bottom line in chatroom.js to skip lobby
 */
// init();

