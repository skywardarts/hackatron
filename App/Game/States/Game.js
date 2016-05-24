import Map2D from '../Objects/Map2D';
import Tron from '../Objects/Tron';
import Player from '../Objects/Player';
import Enemy from '../Objects/Enemy';
import Countdown from '../Objects/Countdown';
import Gameover from '../Objects/Gameover';
import Powerup from '../Objects/Powerup';
import AI from '../Core/AI';

Hackatron.Game = function(game) {
    this.enemy = null;
    this.hostId = null;
    this.player = null;
    this.blocks = [];
    this.fireballs = [];
    this.players = null;
};

var updateTimeout;
var alpha = 0;

Hackatron.Game.prototype = {
    toggleFullscreen: function() {
        this.game.scale.fullScreenScaleMode = Phaser.ScaleManager.EXACT_FIT;
        if (this.game.scale.isFullScreen) {
            this.game.scale.stopFullScreen();
        } else {
            this.game.scale.startFullScreen();
        }
    },

    getTileAt: function(params) {
        if (!typeof(params) === 'object') { throw new Error('Invalid args'); }

        for (var i = 0; i < this.map.collideTiles.length; i++) {
            var tile = this.map.collideTiles[i];
            if (tile.tilePosition.x === params.x && tile.tilePosition.y === params.y) {
                return tile;
            }
        }

        return null;
    },

    getValidPosition: function() {
        var position = null;
        var currentPosition = 0;
        var totalPositions = Hackatron.TILE_COUNT_HORIZONTAL * Hackatron.TILE_COUNT_VERTICAL * 2;

        while (!position && currentPosition < totalPositions) {
            var x = this.game.rnd.integerInRange(1, Hackatron.TILE_COUNT_HORIZONTAL - 1);
            var y = this.game.rnd.integerInRange(1, Hackatron.TILE_COUNT_VERTICAL - 1);
            // mapData goes top to down and left to right
            var tile = this.getTileAt({x: x, y: y});

            // Check it's a floor tile with no power up there yet
            if (!tile && !this.powerups[x][y]) {
                position = {x: x, y: y};
            }

            totalPositions++;
        }

        // We tried once for each tile on the map, twice, with no success
        // Lets just put them at 1,1
        if (!position) {
            position = {x: 1, y: 1};
        }

        //console.log(position);

        return position;
    },

    resizeGame: function(width, height) {
        this.game.width = width;
        this.game.height = height;

        if (this.game.renderType === 1) {
            this.game.renderer.resize(width, height);
            Phaser.Canvas.setSmoothingEnabled(this.game.context, false);
        }
    },

    create: function() {
        Hackatron.game = this;

        document.body.className += ' game';

        this.game.plugins.cameraShake = this.game.plugins.add(Phaser.Plugin.CameraShake);

        this.game.plugins.cameraShake.setup({
            shakeRange: 40,
            shakeCount: 35,
            shakeInterval: 15,
            randomShake: true,
            randomizeInterval: true,
            shakeAxis: 'xy'
        });

        this.players = {};
        this.socket = io.connect();
        this.events = [];

        this.initPhysics();
        this.initMap();
        this.initPowerUps();
        this.initPlayer();
        this.initCountdown();
        this.initSFX();
        this.initHotkeys();

        // Register to listen to events and inform
        // other players that you have joined the game
        this.registerToEvents();
        this.joinGame();

        this.initEvents();

        this.game.stage.disableVisibilityChange = true;

        window.UI_state.screenKey = 'ingame';
        window.UI_controller.setState(window.UI_state);
    },

    initEvents: function() {
        this.eventsInterval = setInterval(this.broadcastEvents.bind(this), 100);

        var lastUpdateInfo = null;

        // Send player position every 50ms
        this.updatePosInterval = setInterval(() => {
            this.player.character.updatePos();

            if (!this.player.character.sprite.body) { return;}
            if (!this.player.character.dirty) { return; }

            var info = {
                id: this.player.id,
                position: this.player.character.position,
                direction: this.player.character.direction
            };

            // Don't send an event if its the same as last time
            if (lastUpdateInfo && info.position.x == lastUpdateInfo.position.x
                && info.position.y == lastUpdateInfo.position.y) {
                return;
            }

            this.fireEvent({key: 'updatePlayer', info: info});

            lastUpdateInfo = info;
        }, UPDATE_INTERVAL);

        // If this is the host
        // Send enemy position every 50ms
        this.enemyInterval = setInterval(() => {
            if (this.enemy && this.player.id === this.hostId) {
                //this.enemy.character.updatePos();

                if (!this.enemy.character.dirty) { return; }

                this.enemy.character.dirty = false;

                var info = {
                    position: this.enemy.character.position,
                    direction: this.enemy.character.direction
                };

                this.fireEvent({key: 'updateEnemy', info: info});
            }
        }, UPDATE_INTERVAL);
    },

    initPhysics: function() {
        this.game.physics.startSystem(Phaser.Physics.ARCADE);
    },

    initHotkeys: function() {
        this.fullscreenKey = this.game.input.keyboard.addKey(Phaser.Keyboard.F);
        this.fullscreenKey.onDown.add(this.toggleFullscreen, this);
        this.aiKey = this.game.input.keyboard.addKey(Phaser.Keyboard.I);
        this.aiKey.onDown.add(this.toggleAI, this);

        // variables used to detect and manage swipes
        var startX;
        var startY;
        var endX;
        var endY;

        // when the player begins to swipe we only save mouse/finger coordinates, remove the touch/click
        // input listener and add a new listener to be fired when the mouse/finger has been released,
        // then we call endSwipe function
        var beginSwipe = function() {
            startX = this.game.input.worldX;
            startY = this.game.input.worldY;
            this.game.input.onDown.remove(beginSwipe, this);
            this.game.input.onUp.add(endSwipe, this);
        };

        // function to be called when the player releases the mouse/finger
        var endSwipe = function() {
            // saving mouse/finger coordinates
            endX = this.game.input.worldX;
            endY = this.game.input.worldY;
            // determining x and y distance travelled by mouse/finger from the start
            // of the swipe until the end
            var distX = startX-endX;
            var distY = startY-endY;
            // in order to have an horizontal swipe, we need that x distance is at least twice the y distance
            // and the amount of horizontal distance is at least 10 pixels
            if (Math.abs(distX)>Math.abs(distY)*2 && Math.abs(distX)>10){
                // moving left, calling move function with horizontal and vertical tiles to move as arguments
                if (distX > 0) {
                    this.onAction('swipeLeft');
                }
                // moving right, calling move function with horizontal and vertical tiles to move as arguments
                else {
                    this.onAction('swipeRight');
                }
            }
            // in order to have a vertical swipe, we need that y distance is at least twice the x distance
            // and the amount of vertical distance is at least 10 pixels
            if (Math.abs(distY)>Math.abs(distX)*2 && Math.abs(distY)>10){
                // moving up, calling move function with horizontal and vertical tiles to move as arguments
                if (distY > 0) {
                    this.onAction('swipeUp');
                }
                // moving down, calling move function with horizontal and vertical tiles to move as arguments
                else {
                    this.onAction('swipeDown');
                }
            }

            // stop listening for the player to release finger/mouse, let's start listening for the player to click/touch
            this.game.input.onDown.add(beginSwipe, this);
            this.game.input.onUp.remove(endSwipe, this);
        };

        // Wait for the player to touch or click
        this.game.input.onDown.add(beginSwipe, this);
    },

    onAction: function(action) {
        if (action === 'swipeLeft') {
            this.player.character.inputLeft = true;
        } else if (action === 'swipeRight') {
            this.player.character.inputRight = true;
        } else if (action === 'swipeUp') {
            this.player.character.inputUp = true;
        } else if (action === 'swipeDown') {
            this.player.character.inputDown = true;
        }
    },

    toggleAI: function() {
        this.ai.enabled = !this.ai.enabled;
    },

    runAiSystem: function() {
        this.ai = new AI();
        this.ai.init({game: this.game, player: this.player, enemy: this.enemy, map: this.map});
    },

    runEnemySystem: function() {
        // Create enemy for the host
        if (!this.enemy) {
            var worldPosition = this.getValidPosition();

            this.enemy = new Enemy();
            this.enemy.init({
                game: this.game,
                speed: DEFAULT_PLAYER_SPEED,
                worldPosition: worldPosition,
                keys: { // TODO: Could be architected better
                    up: Phaser.Keyboard.W,
                    down: Phaser.Keyboard.S,
                    left: Phaser.Keyboard.A,
                    right: Phaser.Keyboard.D
                }
            });
        }
    },

    initPlayer: function() {
        var worldPosition = this.getValidPosition();

        var playerParams = {
            id: Utils.generateId(),
            game: this.game,
            name: this.getRandomName(),
            speed: DEFAULT_PLAYER_SPEED,
            worldPosition: worldPosition,
            points: 1000,
            keys: { // TODO: Could be architected better
                up: Phaser.Keyboard.UP,
                down: Phaser.Keyboard.DOWN,
                left: Phaser.Keyboard.LEFT,
                right: Phaser.Keyboard.RIGHT,
                att: Phaser.Keyboard.SPACEBAR
            }
        };

        this.player = new Player();
        this.player.init(playerParams);

        if (Utils.env.os.mobile) {
            this.game.camera.follow(this.player.character.sprite, Phaser.Camera.FOLLOW_LOCKON);
        }
    },

    initMap: function() {
        this.map = new Map2D();
        this.map.init({game: this.game, player: this.player, enemy: this.enemy});

        // var start = this.map.tilemap.objects['GameObjects'][0];
        // var end = this.map.tilemap.objects['GameObjects'][1];

        // var teleStart = new Phaser.Rectangle(start.x, start.y, start.width, start.height);
        // var teleEnd = new Phaser.Rectangle(end.x, end.y, end.width, end.height);
        // TODO: do stuff with tele points

    },

    initCountdown: function() {
        var countdown = new Countdown();
        countdown.init({game: this.game, player: this.player});
        countdown.start();
    },

    initGameover: function() {
        this.isGameOver = true;

        this.game.plugins.cameraShake.shake();

        var gameover = new Gameover();
        gameover.init(this.game);
        gameover.start();

        setTimeout(function() {
            window.location.reload();
        }, 2000);
        //this.shutdown();
    },

    initDeathScreen: function() {
        this.game.plugins.cameraShake.shake();

        this.enemy.character.worldPosition = this.getValidPosition();
        this.enemy.character.frozen = true;

        // var death = new Gameover();
        // death.init(this.game);
        // death.start();

        this.player.removePoints(100);

        for(var id in this.players) {
            this.players[id].addPoints(100 / this.players.length);
        }

        window.UI_IngameController.setState(window.IngameState);

        this.newGameKey = this.game.input.keyboard.addKey(Phaser.Keyboard.ENTER);
        this.newGameKey.onDown.add(() => {
            // Remove death screen

            this.newGameKey.onDown.remove();
        });

        setTimeout(() => {
            //death.sprite.destroy();
            this.player.character.worldPosition = this.getValidPosition();
            this.player.character.revive();

            setTimeout(() => {
                this.enemy.character.frozen = false;
            }, 1000);
        }, 2000);
    },

    initSFX: function() {
        this.musicKey = this.input.keyboard.addKey(Phaser.Keyboard.M);
        // var fx = this.game.add.audio('sfx');
        // fx.addMarker('monsterRoar', 2, 1.2);
        // fx.addMarker('playerEaten', 5, 0.5);
        // fx.addMarker('playerInWater', 7, 0.5);
        // fx.addMarker('jump', 0, 0.24);
    },

    initPowerUps: function() {
        this.powerups = [];
        for (var i = 0; i <= Hackatron.TILE_COUNT_VERTICAL; i++) {
            this.powerups.push([]);
        }

        this.powerupCheckInterval = setInterval(() => {
            this.powerups.forEach((_, row) => {
                this.powerups[row].forEach((_, column) => {
                    var powerup = this.powerups[row][column];
                    if (powerup && powerup.handler.ended) {
                        this.powerups[row][column] = null;
                    }
                });
            });
        }, 1000);
    },

    runPowerUpSystem: function() {
        var run = () => {
            var powerupHandlers = Object.keys(Powerup.handlers);
            var randomHandler = powerupHandlers[this.game.rnd.integerInRange(0, powerupHandlers.length-1)];
            var powerup = new Powerup();
            powerup.init({key: randomHandler, game: this.game, map: this.map, player: this.player});
            powerup.handler.on('started', () => { this.fireEvent({key: 'foundPowerup', info: {state: powerup.handler.state, player: {id: this.player.id}}}); });
            powerup.handler.on('destroyed', (params) => { params.positions.forEach((position) => { this.powerups[position.x][position.y] = null; }); });

            this.powerups[powerup.handler.state.position.x][powerup.handler.state.position.y] = powerup;

            this.fireEvent({key: 'powerupSpawned', info: {handler: {key: randomHandler, state: powerup.handler.state}}});
        };

        this.powerupInterval = setInterval(run, POWERUP_SPAWN_INTERVAL);

        run();
    },
    fireEvent: function(event) {
        this.events.push(event);

        if (event.key === 'fireballFired') {
            this.parseEvent(event);
        }
    },
    broadcastEvents: function() {
        if (!this.events.length) { return; }

        //console.log('Broadcasting events...', JSON.stringify({events: this.events}));

        this.socket.emit('events', JSON.stringify({events: this.events}));
        this.events = [];
    },
    moveToPointer: function() {
        // Use path finder

    },
    followMouse: function() {
        // top = -1.25
        // bottom = 1
        // left = 2.5
        // right = 0
        // http://phaser.io/examples/v2/arcade-physics/angle-to-pointer
        var angle = this.game.physics.arcade.angleToPointer(this.player.character.sprite) * (180/Math.PI);

        // right
        if (Math.abs(angle) > 0 && Math.abs(angle) <= 45) {
            this.player.character.inputRight = true;
        }
        // left
        if (Math.abs(angle) > 135 && Math.abs(angle) <= 180) {
            this.player.character.inputLeft = true;
        }
        // up
        if (Math.abs(angle) > 45 && Math.abs(angle) <= 135 && angle < 0) {
            this.player.character.inputUp = true;
        }
        // down
        if (Math.abs(angle) > 45 && Math.abs(angle) <= 135 && angle > 0) {
            this.player.character.inputDown = true;
        }

        //  if it's overlapping the mouse, don't move any more
        // if (Phaser.Rectangle.contains(this.player.character.sprite.body, this.game.input.x, this.game.input.y)) {
        //     this.player.character.sprite.body.velocity.x = 0;
        //     this.player.character.sprite.body.velocity.y = 0;
        // }
    },
    constrainVelocity: function(sprite, maxVelocity) {
        if (!sprite || !sprite.body) { return; }
        var body = sprite.body;
        var angle, currVelocitySqr, vx, vy;
        vx = body.velocity.x;
        vy = body.velocity.y;
        currVelocitySqr = vx * vx + vy * vy;
        if (currVelocitySqr > maxVelocity * maxVelocity) {
            angle = Math.atan2(vy, vx);
            vx = Math.cos(angle) * maxVelocity;
            vy = Math.sin(angle) * maxVelocity;
            body.velocity.x = vx;
            body.velocity.y = vy;
        }
    },
    update: function() {
        if (this.musicKey.isDown) {
            this.game.music.mute = !this.game.music.mute;
        }

        this.player.character.inputRight = false;
        this.player.character.inputLeft = false;
        this.player.character.inputUp = false;
        this.player.character.inputDown = false;

        if (this.game.input.mousePointer.isDown) {
            this.followMouse();
        }
        else {
        }

        var collideEnemyHandler = () => {
            if (!this.player.character.isAlive) { return; }
            if (this.player.character.invincible) { return; }

            this.player.kill();

            this.fireEvent({key: 'playerKilled', info: {
                player: {id: this.player.id}
            }});

            this.initDeathScreen();
        };

        var SLIDE_SPEED = this.player.character.speed/4;
        var SLIDE_DISTANCE = 5;

        var closestInRangeOf = (params) => {
            var dir = params.range > 0 ? 1 : -1; // are we going backwards?
            var startPos = params.position[params.align];
            var endPos = startPos + params.range;

            for(var i = startPos; i != endPos; i+= dir) {
                var x = params.align === 'x' ? i : params.position.x;
                var y = params.align === 'y' ? i : params.position.y;
                var tile = this.getTileAt({x: x, y: y});
                if (!tile || !tile.collides) {
                    return i;
                }
            }

            return null;
        };

        var getNearestOpening = (params) => {
            var align;
            var dir;
            var index;
            var direction = params.direction;
            var position = params.position;

            if (direction === 'walkLeft') { align = 'y'; dir = -1; }
            if (direction === 'walkRight') { align = 'y'; dir = +1; }
            if (direction === 'walkUp') { align = 'x'; dir = -1; }
            if (direction === 'walkDown') { align = 'x'; dir = +1; }

            var seekPositionLeft = {x: Math.floor(position.x), y: Math.floor(position.y)};
            seekPositionLeft[align === 'x' ? 'y' : 'x'] += dir; // get the beside row/column
            seekPositionLeft[align === 'y' ? 'y' : 'x'] -= 1; // get the beside row/column
            var seekPositionRight = {x: Math.floor(position.x), y: Math.floor(position.y)};
            seekPositionRight[align === 'x' ? 'y' : 'x'] += dir; // get the beside row/column
            seekPositionRight[align === 'y' ? 'y' : 'x'] += 1; // get the beside row/column

            var closestLeft = closestInRangeOf({position: seekPositionLeft, align: align, range: -SLIDE_DISTANCE});
            var closestRight = closestInRangeOf({position: seekPositionRight, align: align, range: SLIDE_DISTANCE});

            // must be all blocked
            if (!closestLeft && !closestRight) {
                return;
            }

            var diffLeft = Math.abs(params.position[align] - closestLeft);
            var diffRight = Math.abs(params.position[align] - closestRight);

            return {align: align, left: diffLeft, right: diffRight};
        };

        var collideWallHandler = () => {
            if (!this.player.character.direction) {
                return;
            }
            // Find nearest opening and go that way
            // Get current world position
            // Check if direction is up, down, left, or right
            // If direction is up,
            //   check from my position to 0 for the closest opening
            //   check from my position to mapWidth for the closest opening
            // If closest is left, set velocity x = -500
            // If closest is right, set velocity x = 500
            var position = this.player.character.worldPosition;
            var direction = this.player.character.direction;
            var diff = getNearestOpening({position: position, direction: direction});

            if (!diff) {
                return;
            }

            if (diff.left < diff.right) {
                // going left or up
                this.player.character.sprite.body.velocity[diff.align] = -SLIDE_SPEED; // the -SLIDE_SPEED / 5 * diff.left part lets us base the speed we move with how far it is
                //goToPosition = closest * 16 + 8;
            } else if (diff.right < diff.left) {
                // going right or down
                this.player.character.sprite.body.velocity[diff.align] = SLIDE_SPEED;
                //goToPosition = closest * 16 - 8;
            } else {
                // He's probably stuck because a few pixels are touching
                // Lets round his position so he's in alignment
                //this.player.character.sprite.body.velocity.setTo(0, 0);
                this.player.character.position[diff.align] = position[diff.align];
            }
        };

        if (this.enemy) {
            this.constrainVelocity(this.enemy.character.sprite, 10);
        }

        if (this.player.character.collisionEnabled) {
            this.map.collideTiles.forEach((tile) => {
                // TODO: Throttle collideWallHandler
                this.game.physics.arcade.collide(this.player.character.sprite, tile, collideWallHandler); // tile is an object of Phaser.Sprite
                if (this.enemy) {
                    this.enemy.character.sprite.body.immovable = false;
                    this.game.physics.arcade.collide(this.enemy.character.sprite, tile, () => {
                        // Stop enemy from moving. TODO: doesn't work
                        // this.enemy.character.sprite.body.immovable = true;
                        // this.enemy.character.sprite.body.velocity.x = 0;
                        // this.enemy.character.sprite.body.velocity.y = 0;
                    });
                }
            });
        }


        if (this.enemy) {
            if (this.player.character.collisionEnabled) {
                this.game.physics.arcade.overlap(this.enemy.character.sprite, this.player.character.sprite, collideEnemyHandler);
            }
        }

        this.powerups.forEach((row) => {
            row.forEach((powerup) => {
                if (powerup) {
                    powerup.handler.update();
                }
            });
        });

        var collideFireballHandler = (index) => {
            // We don't want to destroy fireballs on contact
            this.player.character.dirty = true;

            this.player.removePoints(10);
            window.UI_IngameController.setState(window.IngameState);
        };

        var collideBlockHandler = () => {
            this.player.character.dirty = true;
            this.player.removePoints(2);
            window.UI_IngameController.setState(window.IngameState);
        };

        this.blocks.forEach((block) => {
            //console.log(block);
            if (this.player.character.collisionEnabled) {
                this.game.physics.arcade.collide(this.player.character.sprite, block, collideBlockHandler);
            }

            if (this.enemy) {
                this.game.physics.arcade.collide(this.enemy.character.sprite, block, () => {

                });
            }
        });

        this.fireballs.forEach((fireball, index) => {
            if (fireball.owner !== this.player.id) {
                console.log(fireball);
                this.game.physics.arcade.collide(this.player.character.sprite, fireball, () => {
                    collideFireballHandler(index);
                    // Disable fireball physics. TODO: doesn't work
                    // fireball.body.moves = false;
                    // fireball.body.immovable = false;
                });
            }
            if (this.enemy) {
                this.game.physics.arcade.collide(this.enemy.character.sprite, fireball, () => {
                    // Disable fireball physics. TODO: doesn't work
                    // fireball.body.moves = false;
                    // fireball.body.immovable = false;
                });
            }
        });

        if (this.player) {
            this.game.world.bringToTop(this.player.character.sprite);
        }
    },

    fitToWindow: function() {
        this.game.canvas.style['margin'] = 'auto';

        if (this.isGameOver) {
        } else {
            var pers = 700; //1500 - ((500 / 32) * this.player.character.worldPosition.y);
            var xDeg = 15;
            var yDeg = 0;
            var zDeg = 0;
            var rDeg = -3;
            var xSkew = 0; // (1 - ((2 / 32) * this.player.character.worldPosition.x));

            if (Utils.env.os.mobile) {
                this.game.canvas.style['width'] = '110%';
                this.game.canvas.style['height'] = '110%';
                this.game.canvas.style['margin-top'] = '-20%';
            } else {
                this.game.canvas.style['width'] = '90%';
                this.game.canvas.style['height'] = '90%';
            }
            this.game.canvas.style['transform'] = 'perspective(' + pers + 'px) skew(' + xSkew + 'deg, 0deg) rotateX(' + xDeg + 'deg) rotateY(' + yDeg + 'deg) rotate(' + rDeg + 'deg)';
        }

        document.getElementById('game').style['width'] = Hackatron.getWidthRatioScale() * 100 + '%';
        document.getElementById('game').style['height'] = Hackatron.getHeightRatioScale() * 100 + '%';
        document.getElementById('ui').style['transform'] = 'none';
    },
    shutdown: function() {
        this.socket.removeAllListeners('events');
        this.powerupInterval && clearInterval(this.powerupInterval);
        this.updatePosInterval && clearInterval(this.updatePosInterval);
        this.eventsInterval && clearInterval(this.eventsInterval);
        this.enemyInterval && clearInterval(this.enemyInterval);
        this.powerupCheckInterval && clearInterval(this.powerupCheckInterval);
        this.player = null;
        this.enemy = null;
        this.hostId = null;
        this.events = [];
    },

    render: function() {
        this.fitToWindow();
        //this.enableCollisionDebugging();

        if (this.player && this.enemy) {
            var distance = this.game.physics.arcade.distanceBetween(this.player.character.sprite, this.enemy.character.sprite);
            var DANGER_DISTANCE = 300;

            if (distance > DANGER_DISTANCE) {
                alpha = 0;
            } else {
                alpha = (DANGER_DISTANCE - distance) / DANGER_DISTANCE;
                if (this.tweenRed) {
                    this.tweenRed.stop();
                }

                this.map.tilemap.layers[2].alpha = alpha;
                //this.tweenRed = this.game.add.tween(this.map.tilemap.layers[2]).to({alpha: alpha}, 50, 'Linear', true, 0, 1);
            }
        }
    },

    enableCollisionDebugging: function() {
        this.game.debug.bodyInfo(this.player.character.sprite, 32, 32);
        this.game.debug.body(this.player.character.sprite);
    },

    getPlayerById: function(playerId) {
        if (playerId == this.player.id) {
            return this.player;
        }
        if (this.players[playerId]) {
            return this.players[playerId];
        }

        return null;
    },

    getRandomName: function() {
        var names = ['riffongrief', 'Blood', 'Midnight', 'Puritytempest', 'Jester', 'Goldmagus', 'Lightning', 'Madguard', 'Lionshadow', 'Tempest', 'Eternity', 'Faunaguard', 'Lordbeast', 'Darklord', 'Veil', 'Tombmourner', 'Hateghost', 'Spirittotem', 'Cometzealot', 'Wind', 'Paradox', 'Tombsinner', 'Darkgod', 'Reaper', 'Firereaper', 'Shadowhowl', 'Spiritlord', 'Gust', 'Song', 'Lord', 'Gunner', 'Dawn', 'King', 'King', 'Knightkiller', 'Rubyguard', 'Whitemidnight', 'Flame', 'Roseice', 'Mourner', 'Lordicon', 'Pandemonium', 'Fellkiller', 'Rascalfinder', 'Claw', 'Ragechaos', 'Ragnarok', 'Demonheart', 'Talonknight', 'Bane', 'Windseeker', 'Warsaber', 'Lionslayer', 'Veil', 'Darkbeast', 'Honorreaper', 'Lancequake', 'Victory', 'Warlockmage', 'Nemesis', 'Queen', 'Bloodbattler', 'Jericho', 'Roguegriffon', 'Wanderlust', 'Mageslayer', 'Cursefinder', 'Legend', 'Beastclaw', 'Shadow', 'Faunaknight', 'Grave', 'Demonfinder', 'Fauna', 'Cult', 'Noblewarlock', 'Faunachanter', 'Battler', 'Talonreaper', 'Steeliron'];

        return names[Math.floor(Math.random() * names.length)]
    },

    createPlayer: function(playerId) {
        var player = new Player();

        player.init({
            id: playerId,
            game: this.game,
            speed: DEFAULT_PLAYER_SPEED
        });

        this.players[playerId] = player;

        // We probably don't need physics for other players - they are telling us where they are already
        //this.game.physics.arcade.collide(player.character.sprite, this.map.layer);
        this.game.physics.arcade.collide(player.character.sprite, this.player.character.sprite, () => {
            this.player.removePoints(5);
            player.removePoints(5);
        }, null, this.game);

        return player;
    },

    welcomePlayer: function(playerId) {
        // Add players
        var players = [];
        for(playerId in this.players) {
            var player = this.players[playerId];

            players.push({
                id: player.id,
                name: player.name,
                position: player.character.position,
                points: player.points
            });
        }

        // Add the host
        // TODO: Wat? Needs clarification
        players.push({
            id: this.player.id,
            name: this.player.name,
            position: this.player.character.position,
            points: this.player.points
        });

        // Add powerups
        var powerups = [];
        for(row in this.powerups) {
            for(column in this.powerups[row]) {
                var powerup = this.powerups[row][column];

                if (!powerup) { continue; }

                powerups.push({handler: {key: powerup.handler.key, state: powerup.handler.state}});
            }
        }

        // Compile the game data
        var gameData = {
            player: {id: playerId},
            enemy: {position: this.enemy.character.position},
            powerups: powerups,
            players: players
        };

        this.fireEvent({key: 'welcomePlayer', info: gameData});
    },

// ============================================================================
//                          Socket Event Handlers
// ============================================================================
    parseEvent: function(event) {
        console.log('Got event: ' + event.key, event.info);

        // Method for updating board local client game state using info
        // broadcasted to all players. The info variable contains the
        // following keys:
        // {player: {id: 1}, position: {x, y}, direction: 'walkRight'}
        if (event.key === 'updatePlayer') {
            var id = event.info.id;
            var position = event.info.position;
            var direction = event.info.direction;

            // Don't update ourself (bug?)
            if (event.info.id === this.player.id) { return; }

            var player = this.getPlayerById(id);

            if (!player) { return; }

            // disable animations for now - lag?
            if (player.character.sprite.body) {
                player.character.sprite.animations.play(direction, 3, false);
                player.character.position = position;
            }
        } else if (event.key === 'updateEnemy') {
            if (this.player.id !== this.hostId) {
                if (this.enemy) {
                    this.enemy.character.position = event.info.position;
                }
            }
        // When new player joins, host shall send them data about the 'position'
        } else if (event.key === 'newPlayer') {
            // If we're this player, we don't need to do anything
            if (this.player.id === event.info.player.id) { return; }

            if (this.player.id === this.hostId) {
                this.welcomePlayer(event.info.player.id);
            }

            var player = this.getPlayerById(event.info.player.id);

            if (!player) {
                player = this.createPlayer(event.info.player.id);
            }

            player.name = event.info.player.name;
            player.character.position = event.info.player.position;

            console.log('New player ' + event.info.player.id + ' has joined the game!');
        // Set up game state as a new player receiving game data from host
        } else if (event.key === 'welcomePlayer') {
            if (this.player.id === event.info.player.id) {
                // Setup players
                event.info.players.forEach((playerInfo) => {
                    var player = this.createPlayer(playerInfo.id);
                    player.name = playerInfo.name;
                    if (playerInfo.position) {
                        player.character.position = playerInfo.position;
                    }
                    player.points = playerInfo.points;

                    this.players[player.id] = player;
                });

                // Setup enemy
                this.enemy = new Enemy();

                this.enemy.init({
                    game: this.game,
                    speed: DEFAULT_PLAYER_SPEED,
                    position: event.info.enemy.position
                });

                // Setup powerups
                event.info.powerups.forEach((powerupInfo) => {
                    var powerup = new Powerup();
                    powerup.init({key: powerupInfo.handler.key, game: this.game, map: this.map, player: this.player, state: powerupInfo.handler.state});
                    powerup.handler.on('destroyed', (params) => { params.positions.forEach((position) => { this.powerups[position.x][position.y] = null; }); });

                    this.powerups[powerup.handler.state.position.x][powerup.handler.state.position.y] = powerup;
                });
            }
        // Method for handling received deaths of other clients
        } else if (event.key === 'playerKilled') {
            var player = this.players[event.info.player.id];

            if (player) {
                player.kill();
            }

            this.player.addPoints(100 / this.players.length);
            window.UI_IngameController.setState(window.IngameState);
        // Method for handling player leaves
        } else if (event.key === 'playerLeave') {
            if (this.players[event.info.player.id]) {
                var player = this.players[event.info.player.id];
                player.kill();

                delete this.players[event.info.player.id];
            }
        // Method for handling spawned power ups by the host
        } else if (event.key === 'powerupSpawned') {
            // TODO: we already do this above, refactor it out
            var powerup = new Powerup();
            powerup.init({key: event.info.handler.key, game: this.game, map: this.map, player: this.player, state: event.info.handler.state});
            powerup.handler.on('started', () => { this.fireEvent({key: 'foundPowerup', info: {player: {id: this.player.id}, state: powerup.handler.state}}); });
            powerup.handler.on('destroyed', (params) => { params.positions.forEach((position) => { this.powerups[position.x][position.y] = null; }); });

            this.powerups[powerup.handler.state.position.x][powerup.handler.state.position.y] = powerup;
        // Method for handling spawned blocks by other players
        } else if (event.key === 'foundPowerup') {
            // TODO: we already do this above, refactor it out
            var powerup = this.powerups[event.info.state.position.x][event.info.state.position.y];

            if (powerup) {
                this.powerups[event.info.state.position.x][event.info.state.position.y] = null;
                powerup.handler.player = this.getPlayerById(event.info.player.id);
                powerup.handler.start();
            }
        // Method for handling spawned blocks by other players
        } else if (event.key === 'blockSpawned') {
            var block = this.game.add.sprite(event.info.x, event.info.y, 'gfx/blocks/glitch');
            // block.key.copyRect('powerups', getRect(5, 4), 0, 0);
            this.game.physics.arcade.enable(block, Phaser.Physics.ARCADE);
            block.animations.add('glitch', [0,1,2], 12, true, true);
            block.animations.play('glitch');
            block.scale.x = 1;
            block.scale.y = 1;
            block.body.immovable = true;

            // Make block fade in 2.0 seconds
            var BLOCK_DURATION = 2000;
            this.game.add.tween(block).to({ alpha: 0 },  BLOCK_DURATION, 'Linear', true, 0, -1);

            this.blocks.push(block);
            setTimeout(() => {
                Hackatron.game.blocks = Hackatron.game.blocks.filter((b) => {
                    return (b !== block);
                });

                block.destroy();
            },  BLOCK_DURATION);
        } else if (event.key === 'fireballFired') {
            var FIREBALL_SPEED = 400;
            var FIREBALL_DURATION = 0;

            var fireball = this.game.add.sprite(event.info.x, event.info.y, 'gfx/buffs');
            fireball.owner = event.info.owner;
            fireball.anchor.setTo(0.5);

            if (event.info.characterKey === 'super-saiyan') {
                fireball.animations.add('fireball', ['buffs/blast-attack/1', 'buffs/blast-attack/2', 'buffs/blast-attack/3'], 60, true, true);
                fireball.scale.x = 0.5;
                fireball.scale.y = 0.5;
                // makes block fade away within a 0.2 seconds
                FIREBALL_DURATION = 200;
            } else if (event.info.characterKey === 'one') {
                fireball.animations.add('fireball', ['buffs/lightning-attack/1', 'buffs/lightning-attack/2', 'buffs/lightning-attack/3', 'buffs/lightning-attack/4', 'buffs/lightning-attack/5', 'buffs/lightning-attack/6'], 90, true, true);
                fireball.scale.x = 0.5;
                fireball.scale.y = 0.5;
                // makes block fade away within a 0.4 seconds
                FIREBALL_DURATION = 600;
            }

            this.game.physics.arcade.enable(fireball, Phaser.Physics.ARCADE);
            fireball.body.collideWorldBounds = false;
            fireball.body.mass = .9;
            fireball.body.immovable = true;

            fireball.animations.play('fireball');
            this.fireballs.push(fireball);

            switch (event.info.direction) {
            case 'walkUp':
                fireball.body.velocity.y = -FIREBALL_SPEED;
                fireball.angle = -90;
                break;
            case 'walkDown':
                fireball.body.velocity.y = FIREBALL_SPEED;
                fireball.angle = 90;
                break;
            case 'walkLeft':
                fireball.body.velocity.x = -FIREBALL_SPEED;
                fireball.angle = 180;
                break;
            case 'walkRight':
                fireball.body.velocity.x = FIREBALL_SPEED;
                break;
            default:
                break;
            }

            var tween = this.game.add.tween(fireball).to( { alpha: 0 }, FIREBALL_DURATION, 'Linear', true);
            tween.onComplete.add(function() {
                tween.stop();
            });

            setTimeout(function() {
                if (fireball) {
                    Hackatron.game.fireballs = Hackatron.game.fireballs.filter(function(fb) {
                        return (fb !== fireball);
                    });
                    fireball.destroy();
                }
            }, FIREBALL_DURATION);
        } else if (event.key === 'setHost') {
            // Check if we already know this is the host,
            // And if it's this player, we don't need to set ourselves up again
            if (this.hostId === event.info.player.id) { return; }

            this.hostId = event.info.player.id;

            // If this player is the new host, lets set them up
            if (this.hostId === this.player.id) {
                console.log('Hey now the host, lets do this!\n' + this.hostId);

                this.runEnemySystem();

                setTimeout(() => {
                    this.runAiSystem();
                    this.runPowerUpSystem();
                }, 3000);
            }
        }
    },
    registerToEvents: function () {
        // Method for receiving multiple events at once
        // {events: [{key: 'eventName', info: {...data here...}]}
        this.socket.on('events', (data) => {
            data.events.forEach((event) => { this.parseEvent(event); });
        });
    },

    // Method to broadcast to  other clients (if there are any) that you have
    // joined the game
    joinGame: function () {
        this.fireEvent({key: 'newPlayer', info: {
            player: {
                id: this.player.id,
                name: this.player.name,
                position: this.player.character.position
            }
        }});
    }
};
