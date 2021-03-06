class AI {
    constructor() {
        this.pathToPosition = null;
        this.enabled = true;
    }

    findPath(origin, target, cb) {
        var originCoord = this.getCoordFromPoint(origin);
        var targetCoord = this.getCoordFromPoint(target);

        if (!this.outsideGrid(originCoord) && !this.outsideGrid(targetCoord)) {
            this.debug && console.log('Pathing from ', originCoord.x + ',' + originCoord.y + ' to ' + targetCoord.x + ',' + targetCoord.y);

            this.easyStar.findPath(originCoord.x, originCoord.y, targetCoord.x, targetCoord.y, cb);
            this.easyStar.calculate();
            return true;
        }

        return false;
    }

    outsideGrid(coord) {
        return coord.y < 0 || coord.y > this.gridDimensions.y - 1 || coord.x < 0 || coord.x > this.gridDimensions.x - 1;
    }

    getCoordFromPoint(point) {
        var y = Math.floor(point.y / this.tileDimensions.y);
        var x = Math.floor(point.x / this.tileDimensions.x);
        return {y: y, x: x};
    }

    getPointFromCoord(coord) {
        var x = (coord.x * this.tileDimensions.x);
        var y = (coord.y * this.tileDimensions.y);
        return new Phaser.Point(x, y);
    }

    tracePath(path) {
        path.forEach((pathItem) => {
            if (!this.pathTraceSprite) {
                this.pathTraceSprite = this.game.add.graphics(pathItem.x, pathItem.y);
                this.pathTraceSprite.lineStyle(7, 0xffd900, 0);
            } else {
                this.pathTraceSprite.lineTo(pathItem.x - this.pathTraceSprite.x, pathItem.y - this.pathTraceSprite.y);
            }
        });

        if (this.pathTraceSprite) {
            this.pathTraceSprite.endFill();
        }
    }

    resetTrace() {
        if (!this.pathTraceSprite) {
            return;
        }

        this.pathTraceSprite.destroy();
        this.pathTraceSprite = null;
    }

    findTarget() {
        var targets = [Hackatron.game.player.character];

        for (var id in Hackatron.game.players) {
            if (!Hackatron.game.players[id].character.isAlive) { continue; }
            targets.push(Hackatron.game.players[id].character);
        }

        if (!targets.length) {
            return null;
        }

        return targets[Math.floor(Math.random() * (targets.length))];
    }

    reposition() {

    }

    monitorCharacter(character) {
        var oldPosition = null;

        this.monitorCharacterInterval = setInterval(() => {
            if (!this.enabled) { return; }

            if (!oldPosition) {
                oldPosition = character.worldPosition;
                return;
            }

            var newPosition = character.worldPosition;

            // Character is stuck so lets reset him
            if (oldPosition.x === newPosition.x
            && oldPosition.y === newPosition.y) {
                character.worldPosition = Hackatron.game.getValidPosition();
                this.pathToPosition = null;
                this.resetTrace();
                character.resetPath();
            }

            oldPosition = character.worldPosition;
        }, 1000);
    }

    init(params) {
        if (!this.enabled) { return; }

        this.debug = false;
        this.map = params.map;
        this.game = params.game;
        this.player = params.player;
        this.enemy = params.enemy;
        this.enabled = true;
        this.lastChanged = null;

        var originalLevel = Utils.transpose(this.map.data);
        var convertedLevel = [];

        // EasyStar expects a multidimensional array of the rows and columns
        for(var i = 0; i < Hackatron.GAME_WIDTH; i++) {
            convertedLevel[i] = [];
            for (var j = 0; j < Hackatron.GAME_HEIGHT; j++) {
                convertedLevel[i][j] = 0;
            }
        }
        
        this.map.collideTiles.forEach((tile) => {
            if (!tile) { return; } // TODO  || !tile.properties.collides

            convertedLevel[tile.tilePosition.y][tile.tilePosition.x] = 1;
        });

        this.debug && console.log('AI converted level: ', convertedLevel);

        this.easyStar = new EasyStar.js();
        this.easyStar.setGrid(convertedLevel);
        this.easyStar.setAcceptableTiles([0]);
        // Unfortunately I dont think these are helping
        this.easyStar.disableDiagonals();
        this.easyStar.setIterationsPerCalculation(1000);
        this.lastValidPosition = null;
        // this.easyStar.enableDiagonals();
        // this.easyStar.disableCornerCutting();
        // this.easyStar.enableCornerCutting();

        this.tileDimensions = {x: 16, y: 16};
        this.gridDimensions = {y: Hackatron.GAME_HEIGHT, x: Hackatron.GAME_WIDTH};

        var sourceCharacter = this.enemy.character;
        var targetCharacter = this.findTarget();

        this.monitorCharacter(sourceCharacter);

        var MODES = {
            'FOLLOW': 0.95,
            'PERSISTENT': 0.01,
            'CONFUSED': 0.01,
            'SWITCHER': 0.03
        };

        const findMode = (values) => {
            var choices = [];
            var probabilities = [];
            var total = 0;

            for (var value in values) {
                if (values.hasOwnProperty(value)) {
                    total += values[value];
                    choices.push(value);
                    probabilities.push(total);
                }
            }

            var pick = Math.random() * total;
            for (var i = 0; i < choices.length; i++) {
                var p = probabilities[i];
                if (p > pick) {
                    return choices[i];
                }
            }
        };

        var currentMode = findMode(MODES);

        setInterval(function() {
            // Check if the character is outside of map
            // or if character collides on the current tile
            // Reset his position
            // And reset the path finding

            var sourceTile = Hackatron.game.getTileAt({
                x: Math.floor(sourceCharacter.worldPosition.x),
                y: Math.floor(sourceCharacter.worldPosition.y)
            });
            if (sourceCharacter.worldPosition.x < 0
                || sourceCharacter.worldPosition.y < 0
                || (sourceTile && sourceTile.collides)) {
                sourceCharacter.worldPosition = this.lastValidPosition;
                this.pathToPosition = null;
                this.resetTrace();
                sourceCharacter.resetPath();
            }
        }.bind(this), 1000);

        this.followInterval = setInterval(() => {
            if (!this.enabled) {
                this.pathToPosition = null;
                this.resetTrace();
                sourceCharacter.resetPath();
                return;
            }

            this.lastValidPosition = sourceCharacter.worldPosition;

            if (!targetCharacter || !targetCharacter.isAlive) {
                sourceCharacter.resetPath();
                targetCharacter = this.findTarget();
                this.pathToPosition = null;
                return;
            }

            if (this.pathToPosition) {
                this.debug && console.log(currentMode);

                // Check if what we're targetting has changed positions
                if (currentMode === 'FOLLOW') {
                    this.debug && console.log('[AI] Sticking with it...');
                    // Keep chasing this mother down...

                    for (var i = 0; i < 10; i++) {
                        sourceCharacter.pathFind();
                    }

                    if (this.pathToPosition.x !== targetCharacter.position.x || this.pathToPosition.y !== targetCharacter.position.y) {
                        this.debug && console.log('[AI] Repathing...');
                        sourceCharacter.resetPath();
                        this.pathToPosition = null;
                        this.resetTrace();
                        currentMode = findMode(MODES);
                        targetCharacter = targetCharacter;

                        this.findPath(sourceCharacter.position, targetCharacter.position, (pathCoords) => {
                            if (!pathCoords) { return; }

                            var path = pathCoords.map((pathCoord) => {
                                return this.getPointFromCoord({y: pathCoord.y, x: pathCoord.x});
                            });

                            this.tracePath(path);
                            sourceCharacter.moveThroughPath(path);

                            this.pathToPosition = targetCharacter.position;

                            for (var i = 0; i < 10; i++) {
                                sourceCharacter.pathFind();
                            }
                        });
                    }
                } else if (currentMode === 'PERSISTENT') {
                    this.debug && console.log('[AI] Sticking with it...');
                    // Keep chasing this mother down...
                    var finished = sourceCharacter.pathFind();

                    if (finished) {
                        this.debug && console.log('[AI] Finding new target...');
                        sourceCharacter.resetPath();
                        this.pathToPosition = null;
                        this.resetTrace();
                        currentMode = findMode(MODES);
                        targetCharacter = this.findTarget();
                    }
                } else {
                    if (this.pathToPosition.x !== targetCharacter.position.x || this.pathToPosition.y !== targetCharacter.position.y) {
                        if (currentMode === 'SWITCHER') {
                            this.debug && console.log('[AI] Switching to new target...');
                            sourceCharacter.resetPath();
                            this.pathToPosition = null;
                            this.resetTrace();
                            currentMode = findMode(MODES);
                            targetCharacter = this.findTarget();
                        } else if (currentMode === 'CONFUSED') {
                            this.debug && console.log('[AI] Pretending confusion...');
                            sourceCharacter.resetPath();
                            this.pathToPosition = null;
                            this.resetTrace();
                            var pos = Hackatron.game.getValidPosition();
                            targetCharacter = {position: {x: pos.x * 16, y: pos.y * 16}, isAlive: true};
                        }
                    } else {
                        // If nothing has changed, we just need to keep updating
                        var finished = sourceCharacter.pathFind();

                        if (finished) {
                            this.debug && console.log('[AI] Finding new target...');
                            sourceCharacter.resetPath();
                            this.pathToPosition = null;
                            this.resetTrace();
                            currentMode = findMode(MODES);
                            targetCharacter = this.findTarget();
                        }
                    }
                }
            } else {
                this.findPath(sourceCharacter.position, targetCharacter.position, (pathCoords) => {
                    if (!pathCoords) { return; }

                    var path = pathCoords.map((pathCoord) => {
                        return this.getPointFromCoord({y: pathCoord.y, x: pathCoord.x});
                    });

                    this.tracePath(path);
                    sourceCharacter.moveThroughPath(path);

                    this.pathToPosition = targetCharacter.position;
                });
            }
        }, 20); // TODO: why 20?
    }

    stopPathFinding() {
        clearInterval(this.followInterval);
    }
}

export default AI;
