'use strict';

let socket = io();

/*
 *EaselJS Globals
 */

let easelCan, easelCtx, loader, stage, stageheight, stagewidth;
let timestamps=[];
let framerate=60;
let datastamps=[];
let objs=[];
let gamerunning=true;

let R2D = 180/Math.PI;

/***
 * Create easeljs variables, load assets
 */
function init() {
    easelCan = document.getElementById('easelcan');
    easelCtx = easelCan.getContext('2d');
    stage = new createjs.Stage(easelCan);
    stage.snapPixelsEnabled = true;
    stagewidth = stage.canvas.width;
    stageheight = stage.canvas.height;
    let manifest = [
        {src:'../assets/asteroid.png', id: 'asteroid'},
        {src:'../assets/laser.png', id: 'laser'},
        {src:'../assets/ship1.png', id: 'player1'},
        {src:'../assets/ship2.png', id: 'player2'},
        {src:'../assets/ship3.png', id: 'player3'},
        {src:'../assets/ship4.png', id: 'player4'},
        {src:'../assets/background.png', id:'background'},
        {src:'../assets/laserexplosion.png', id: 'laserexplosion'},
    ]
    loader = new createjs.LoadQueue(false);
    loader.installPlugin(createjs.Sound);
    createjs.Sound.alternateExtensions=["ogg"];
    loader.addEventListener('complete', handleComplete);
    loader.loadManifest(manifest, true);
    loader.loadFile({src:'../assets/laserfire.ogg', id:'laserfire'});
}

/***
 * Choose appropriate framerate for user
 * @param e
 */
function tick(e) {

    const now = performance.now();
    while(timestamps.length>0 && timestamps[0]<=now-1000) {
        timestamps.shift();
    }
    timestamps.push(now);
    if(timestamps.length<45) {
        framerate=30;
    } else if(timestamps.length<75) {
        framerate=60;
    }
    else if(timestamps.length<105) {
        framerate=90;
    }
    else if(timestamps.length<130) {
        framerate=120;
    }
    else if(timestamps.length<160) {
        framerate=144;
    } else {
        framerate=240;
    }
    createjs.Ticker.framerate = framerate;
    document.getElementById('fps').innerHTML = 'fps: '+framerate;
    stage.update(e);
}

/***
 * Begin easeljs loop upon completion of loading assets
 */
function handleComplete() {

    createjs.Ticker.framerate = framerate;
    createjs.Ticker.timingMode = createjs.Ticker.RAF;
    createjs.Ticker.addEventListener('tick', tick);

    renderBackground();

    //Render Box2D objects passed from server
    socket.on('objdata', (data) => {
        if(gamerunning) {
            for (let i in data) {
                if (data[i].objid.includes('player')) {
                    renderPlayer(data[i]);
                }
                if (data[i].objid.includes('asteroid')) {
                    renderAsteroid(data[i]);
                }
                if (data[i].objid.includes('laser')) {
                    renderLaser(data[i]);
                }
                for (let index = 0; index < objs.length; index++) {
                    if (data[i].objid == objs[index].name) {
                        objs[index].x = data[i].x;
                        objs[index].y = data[i].y;
                    }
                }
            }
            const now = performance.now();
            while (datastamps.length > 0 && datastamps[0] <= now - 1000) {
                datastamps.shift();
            }
            datastamps.push(now);
            document.getElementById('datarate').innerHTML = 'datarate: ' + datastamps.length;
        }
    });

    //Shoot laser
    socket.on('shoot', (msg) => {
        socket.emit('shoot');
        if(msg==socket.id) {
            createjs.Sound.play('laserfire');
        }
    });

    //Render explosion at position given by msg
    socket.on('explosion', (msg) => {
       renderExplosion(msg.x,msg.y,msg.size);
    });

    //Destroy easeljs object
    socket.on('destroy', (objid) => {
        for(let i=0; i<objs.length;i++) {
            if(objs[i].objid==objid) {
                let itemtodestroy = stage.getChildByName(objs[i].objid);
                stage.removeChild(itemtodestroy);
                objs.splice(i, 1);
            }
        }
    });

    //Update current score
    socket.on('updatescore', (score) => {
        let scorespan = document.getElementById("score");
        scorespan.innerText="Score: "+score;
    });

    //End easeljs loop, destroy all objects and display game over screen
    socket.on('endgame', () => {
        gamerunning=false;
        stage.removeAllChildren();
        stage.update();
        createjs.Ticker.paused = true;
        let gameoverspan = document.getElementById("gameover");
        gameoverspan.hidden=false;
    });
}

$(document).keydown(function(e){
    socket.emit('keydown', ({keyCode: e.keyCode, sockid:socket.id}));
});

$(document).keyup(function(e){
    socket.emit('keyup', ({keyCode: e.keyCode, sockid:socket.id}));
});

/***
 * Easel Helper Functions
 */

/***
 * Destroy a given item
 * @param item
 */
function destroy(item) {
    let itemtodestroy = stage.getChildByName(item.objid);
    this.stage.removeChild(itemtodestroy);
}

/***
 * Render the background image
 */
function renderBackground() {
    console.log(loader.getResult('background'));
    let easelbackground = makeBitmap(
        loader.getResult('background'),
        stagewidth,
        stageheight
    );
    easelbackground.x = stagewidth / 2;
    easelbackground.y = stageheight / 2;
    stage.addChild(easelbackground);
}

/***
 * Render a ship for player control
 * @param obj
 */
function renderPlayer(obj) {
    let spritedata = {
        images: [loader.getResult(obj.objid)],
        frames: {width: 32, height: 32},
        animations: {
            fire: [0, 1, 2, 3]
        }
    }
    let found=false;
    for(let i in objs) {
        if(objs[i].objid==obj.objid) {
            found=true;
            objs[i].x=obj.x;
            objs[i].y=obj.y;
        }
    }
    if(found==false) {
        let spriteSheet = new createjs.SpriteSheet(spritedata);
        let player = new createjs.Sprite(spriteSheet, "fire");
        player.x = obj.x;
        player.y = obj.y;
        player.regX = 16;
        player.regY = 16;
        player.objid = obj.objid;
        player.name = obj.objid;
        objs.push(player);
        stage.addChild(objs[objs.length - 1]);
    }
}

/***
 * Render an asteroid
 * @param obj
 */
function renderAsteroid(obj) {
    let data = {
        images: [loader.getResult('asteroid')],
        frames: {width: 85, height: 100},
        animations: {}
    };
    let spriteSheet = new createjs.SpriteSheet(data);
    let spritenumber;
    let found=false;
    for(let i in objs) {
        if(objs[i].objid==obj.objid) {
            spritenumber=objs[i].spritenumber;
            found=true;
            objs[i].x=obj.x;
            objs[i].y=obj.y;
        }
    }
    if(found==false) {
        //choose random sprite from spritesheet
        spritenumber = (Math.round(Math.random() * 15)).toString();
        let easelasteroid = new createjs.Sprite(spriteSheet);
        easelasteroid.gotoAndStop(spritenumber);
        easelasteroid.x = obj.x;
        easelasteroid.y = obj.y;
        easelasteroid.scaleX = obj.objwidth/60;
        easelasteroid.scaleY = obj.objheight/60;
        easelasteroid.regX = 42;
        easelasteroid.regY = 50;
        easelasteroid.objid = obj.objid;
        easelasteroid.name = obj.objid;
        easelasteroid.spritenumber = spritenumber;
        objs.push(easelasteroid);
        stage.addChild(objs[objs.length - 1]);
    }
}

/***
 * Render a laser
 * @param obj
 */
function renderLaser(obj) {
    let found=false;
    for(let i in objs) {
        if(objs[i].objid==obj.objid) {
            found=true;
            objs[i].x=obj.x;
            objs[i].y=obj.y;
        }
    }
    if(found==false) {
        let easellaser = makeBitmap(loader.getResult('laser'), obj.objwidth, obj.objheight);
        easellaser.x = obj.x;
        easellaser.y = obj.y;
        easellaser.scaleX = obj.objwidth;
        easellaser.scaleY = obj.objwidth;
        easellaser.objid = obj.objid;
        easellaser.name = obj.objid;
        let vecX = Math.cos(obj.r);
        let vecY = Math.sin(obj.r);
        //rotate sprite to match trajectory
        let direction = Math.round((Math.atan(vecY / vecX)) * 180 / Math.PI);
        easellaser.rotation = direction;
        stage.addChild(easellaser);
        objs.push(easellaser);
    }
}

/***
 * Render an explosion
 * @param x
 * @param y
 * @param size
 */
function renderExplosion(x,y,size) {
    let spritearray = Array.from(Array(64).keys());
    let data = {
        images: [loader.getResult("laserexplosion")],
        frames: {width: 256, height: 256},
        animations: {
            "explode": {
                frames: spritearray,
                next: false
            }
        }
    };
    let spriteSheet = new createjs.SpriteSheet(data);
    let easelexplosion = new createjs.Sprite(spriteSheet,"explode");
    easelexplosion.x = x * 30;
    easelexplosion.y = y * 30;
    easelexplosion.scaleX = (size / 30);
    easelexplosion.scaleY = (size / 30);
    easelexplosion.regX = 128;
    easelexplosion.regY = 128;
    stage.addChild(easelexplosion);
    objs.push(easelexplosion);
}

/***
 * Create a bitmap from a loader image
 * @param ldrimg
 * @param b2x
 * @param b2y
 * @param yadjust
 * @returns {*}
 */
function makeBitmap(ldrimg, b2x, b2y, yadjust =  0) {
    let theimage = new createjs.Bitmap(ldrimg);
    let scalex = (b2x * 2) / theimage.image.naturalWidth;
    let scaley = (b2y * 2) / theimage.image.naturalHeight;
    theimage.scaleX = scalex;
    theimage.scaleY = scaley;
    theimage.regX = theimage.image.width / 2;
    theimage.regY = theimage.image.height / 2 - yadjust;
    theimage.snapToPixel = true;
    return theimage;
}