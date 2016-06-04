import GameObject from '../Core/GameObject';

class Powerup extends GameObject {
    toString() { `[Powerup handler={this.key}]` }

    static get handlers() {
        return {
            'Kaihan': KaihanHandler,
            'Saiyan': SaiyanHandler,
            'Invincible': InvincibleHandler,
            'Rage': RageHandler,
            'Teleport': TeleportHandler,
            'Portal': PortalHandler,
            'Freeze': FreezeHandler,
            'BlockUp': BlockUpHandler,
            'SpeedBoost': SpeedBoostHandler
            // TODO: Mode that leaves a train of blocks behind you
        }
    }

    init(params) {
        super.init(params);

        // Events
        this.onStarted = params.onStarted;
        this.onDestroyed = params.onDestroyed;

        // TODO: this guy should move a lot of this logic over to GamePlugin
        this.key = params.key;
        this.handler = new Powerup.handlers[params.key](params);
        this.handler.setup();
    }
}



class PowerupHandler {
    constructor(params) {
        this.spriteMode = null;
        this.finished = false;
        this.claimed = false;
        this.state = {};
        this.fadeTime = 10000;
        this.durationTime = 4000;
        this.destroyTimer = null;

        Object.assign(this, params);
    }

    on(type, cb) {
        this['_on' + type] = this['_on' + type] || [];
        this['_on' + type].push(cb);
    }

    emit(type, args) {
        this['_on' + type] && this['_on' + type].forEach((cb) => { cb(args) });
    }

    _getRect(x, y) {
        return new Phaser.Rectangle(16 * (x-1), 16 * (y-1), 16, 16);
    }

    setup() {
        if (!this.state.position) {
            this.state.position = Hackatron.game.getValidPosition();
        }

        if (this.spriteMode === 'key') {
            this.sprite = this.game.add.sprite(this.state.position.x * 16, this.state.position.y * 16, this.spriteKey);
            this.sprite.animations.add('buffLoop', this.spriteLoop, 6, true, true);
            this.sprite.animations.play('buffLoop');
            this.sprite.scale.x = this.spriteScale ? this.spriteScale : 0.8;
            this.sprite.scale.y = this.spriteScale ? this.spriteScale : 0.8;
        } else if (this.spriteMode === 'tilemap') {
            this.sprite = this.game.add.sprite(this.state.position.x * 16, this.state.position.y * 16, this.game.add.bitmapData(16, 16));
            this.sprite.key.copyRect(this.spriteTilemap, this._getRect(this.spritePosition.column, this.spritePosition.row), 0, 0);
            this.sprite.scale.x = 1.2;
            this.sprite.scale.y = 1.2;
        }

        this.sprite.alpha = 0;

        var tween1 = this.game.add.tween(this.sprite).to({alpha: 1}, 1000, 'Linear', false, 0, 0);
        var tween2 = this.game.add.tween(this.sprite).to({alpha: 0.5}, this.fadeTime - 2000, 'Linear', false, 0, 0);
        var tween3 = this.game.add.tween(this.sprite).to({alpha: 0}, 1000, 'Linear', false, 0, 0);
        tween1.chain(tween2);
        tween2.chain(tween3);
        tween1.start();

        this.game.physics.arcade.enable(this.sprite, Phaser.Physics.ARCADE);

        this.onSetup();

        this.destroyTimer = setTimeout(this.destroy.bind(this), this.fadeTime * 1.5);
    }

    update() {
        // TODO: this is going to be slow, creating new functions/bindings each frame
        this.game.physics.arcade.overlap(this.player.character.sprite, this.sprite, this.start.bind(this), null, this.game);

        this.onUpdated();
    }

    start() {
        if (this.claimed) { return; }

        this.claimed = true;
        this.destroy();

        // If there's no player assigned, then this powerup was not claimed by a different player
        // So it must be us who touched it
        if (!this.player) {
            this.player = Hackatron.game.player; // TODO: shouldn't use global hackatron
        }

        // We only want to show the powerup text if it's the current player who got it
        if (this.player.id === Hackatron.game.player.id) {
            var text = this.name;
            var style = { font: '35px "Press Start 2P"', fill: '#ffffff', align: 'center', textTransform: 'uppercase' };
            this.impactText = this.game.add.text(this.game.camera.view.x + this.game.camera.width / 2, this.game.camera.view.y + this.game.camera.height / 2, text, style);
            this.impactText.anchor.set(0.5);
            var scale = this.game.width / this.game.height;
            this.impactText.width = this.game.width * 0.8;
            this.impactText.height /= scale; // TODO: should work
            this.game.add.tween(this.impactText).to({alpha: 0}, 1000, 'Linear', true, 0);
        }

        this.onStarted();
        this.emit('started');

        setTimeout(this.stop.bind(this), this.durationTime);

        console.log('Powerup START: ' + this.name);
    }

    stop() {
        this.finished = true;

        if (this.player.id === Hackatron.game.player.id) {
            this.impactText.destroy();
        }

        this.onStopped();
        this.emit('stopped');

        console.log('Powerup STOP: ' + this.name);
    }

    destroy() {
        if (!this.sprite) { return; }

        this.sprite.destroy();
        this.sprite = null;

        clearTimeout(this.destroyTimer);

        this.onDestroyed();
        this.emit('destroyed', {positions: [this.state.position]});
    }

    onSetup() {}
    onStarted() {}
    onStopped() {}
    onUpdated() {}
    onDestroyed() {}
}

// Handlers

class KaihanHandler extends PowerupHandler {

    constructor(params) {
        super(params);
        this.name = 'Kaihan!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.durationTime = 10000;
        this.spriteLoop = ['buffs/general/57'];
        this.spriteScale = 1.8;
    }

    onStarted() {
        this.player.character.invincible = true;
        this.oldSkinKey = this.player.character.characterKey;
        this.player.character.changeSkin('one');
        if (this.player.character.speed < Hackatron.DEFAULT_PLAYER_SPEED*Math.pow(1.5, 3)) {
            this.player.character.speed *= 1.5;
        }

        window.GameState.show = false;
        window.UI_GameController.setState(window.GameState);
    }

    onStopped() {
        this.player.character.invincible = false;
        this.player.character.changeSkin(this.oldSkinKey);
        this.player.character.characterKey = this.oldSkinKey;
        this.oldSkinKey = undefined;
        var updatedSpeed = this.player.character.speed / 1.5;
        if (updatedSpeed < Hackatron.DEFAULT_PLAYER_SPEED) {
            this.player.character.speed = Hackatron.DEFAULT_PLAYER_SPEED;
        } else {
            this.player.character.speed = updatedSpeed;
        }

        window.GameState.show = true;
        window.UI_GameController.setState(window.GameState);
    }
}

class SaiyanHandler extends PowerupHandler {

    constructor(params) {
        super(params);
        this.name = 'Super Saiyan!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.durationTime = 10000;
        this.spriteLoop = ['buffs/super-saiyan-icon/01','buffs/super-saiyan-icon/02','buffs/super-saiyan-icon/03','buffs/super-saiyan-icon/04','buffs/super-saiyan-icon/05','buffs/super-saiyan-icon/06','buffs/super-saiyan-icon/07'];
    }

    onStarted() {
        this.player.character.invincible = true;
        this.oldSkinKey = this.player.character.characterKey;
        this.player.character.changeSkin('super-saiyan');
        if (this.player.character.speed < Hackatron.DEFAULT_PLAYER_SPEED*Math.pow(1.5, 3)) {
            this.player.character.speed *= 1.5;
        }

        window.GameState.show = false;
        window.UI_GameController.setState(window.GameState);
    }

    onStopped() {
        this.player.character.invincible = false;
        this.player.character.changeSkin(this.oldSkinKey);
        this.player.character.characterKey = this.oldSkinKey;
        this.oldSkinKey = undefined;
        var updatedSpeed = this.player.character.speed / 1.5;
        if (updatedSpeed < Hackatron.DEFAULT_PLAYER_SPEED) {
            this.player.character.speed = Hackatron.DEFAULT_PLAYER_SPEED;
        } else {
            this.player.character.speed = updatedSpeed;
        }

        window.GameState.show = true;
        window.UI_GameController.setState(window.GameState);
    }
}

class SpeedBoostHandler extends PowerupHandler {
    constructor(params) {
        super(params);
        this.name = 'Madness!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.spriteLoop = ['buffs/speed-boost-icon/01','buffs/speed-boost-icon/02','buffs/speed-boost-icon/03','buffs/speed-boost-icon/04','buffs/speed-boost-icon/05','buffs/speed-boost-icon/06'];
    }

    onStarted() {
        // Allows stacking of max of 3 speed boosts
        if (this.player.character.speed < Hackatron.DEFAULT_PLAYER_SPEED*Math.pow(1.5,3)) {
            this.player.character.speed *= 1.5;
        }
    }

    onStopped() {
        var updatedSpeed = this.player.character.speed / 1.5;
        if (updatedSpeed < Hackatron.DEFAULT_PLAYER_SPEED) {
            this.player.character.speed = Hackatron.DEFAULT_PLAYER_SPEED;
        } else {
            this.player.character.speed = updatedSpeed;
        }
    }
}

class GhostHandler extends PowerupHandler {
    constructor(params) {
        super(params);
        this.name = 'G-G-Ghost!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.spriteLoop = ['buffs/icons/0086'];
        this.spriteScale = 1.2;
    }

    onStarted() {
        this.player.character.collisionEnabled = false;
    }

    onStopped() {
        this.player.character.collisionEnabled = true;
    }
}


class BlockUpHandler extends PowerupHandler {
    constructor(params) {
        super(params);
        this.name = 'Power!!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.spriteLoop = ['buffs/icons/0034'];
        this.spriteScale = 1.2;
    }

    onStarted() {
        this.player.character.blocks += 3;
    }
}


class InvincibleHandler extends PowerupHandler {
    constructor(params) {
        super(params);
        this.name = 'Unstoppable!!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.spriteLoop = ['buffs/icons/0002'];
        this.spriteScale = 1.2;
    }

    onStarted() {
        this.tween = this.game.add.tween(this.player.character.sprite).to({alpha: 0}, 400, 'Linear', true, 0, -1);
        this.player.character.invincible = true;
    }

    onStopped() {
        this.tween.stop();
        this.tween = this.game.add.tween(this.player.character.sprite).to({alpha: 1}, 0, 'Linear', true, 0);
        this.player.character.invincible = false;
    }
}

class RageHandler extends PowerupHandler {
    constructor(params) {
        super(params);
        this.name = 'Rage!!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.spriteLoop = ['buffs/icons/0119'];
        this.spriteScale = 1.2;
    }

    onStarted() {
        this.player.character.sprite.scale.x = 1.5;
        this.player.character.sprite.scale.y = 1.5;
        this.player.character.sprite.body.setSize(this.player.character.sprite.body.width / 1.5, this.player.character.sprite.body.height / 1.5);

        // Allows stacking of max of 3 speed boosts
        if (this.player.character.speed < Hackatron.DEFAULT_PLAYER_SPEED*Math.pow(1.5,3)) {
            this.player.character.speed *= 1.5;
        }
    }

    onStopped() {
        // set back original
        this.player.character.sprite.scale.x = 0.8;
        this.player.character.sprite.scale.y = 0.8;
        this.player.character.sprite.body.setSize(this.player.character.sprite.body.width * 1.5, this.player.character.sprite.body.height * 1.5);

        var updatedSpeed = this.player.character.speed / 1.5;
        if (updatedSpeed < Hackatron.DEFAULT_PLAYER_SPEED) {
            this.player.character.speed = Hackatron.DEFAULT_PLAYER_SPEED;
        } else {
            this.player.character.speed = updatedSpeed;
        }
    }
}


class ReverseHandler extends PowerupHandler {
    constructor(params) {
        super(params);
        this.name = 'Confused!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.spriteLoop = ['buffs/icons/0055'];
        this.spriteScale = 1.2;
    }

    onStarted() {
        this.player.character.speed *= -1;
    }

    onStopped() {
        this.player.character.speed *= -1;
    }
}


class TeleportHandler extends PowerupHandler {
    constructor(params) {
        super(params);
        this.name = 'Blackhole!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.spriteLoop = ['buffs/icons/0035'];
        this.spriteScale = 1.2;
    }

    onStarted() {
        this.player.character.teleport(Hackatron.game.getValidPosition());
    }
}

// Freezes the player for 3 seconds
class FreezeHandler extends PowerupHandler {
    constructor(params) {
        super(params);
        this.name = 'Freeze!';
        this.spriteMode = 'key';
        this.spriteKey = 'gfx/buffs';
        this.spriteLoop = ['buffs/icons/0068'];
        this.spriteScale = 1.2;
    }

    onStarted() {
        this.player.character.sprite.body.velocity.setTo(0, 0);
        this.player.character.frozen = true;
    }

    onStopped() {
        this.player.character.frozen = false;
    }
}


class PortalHandler extends PowerupHandler {
    constructor(params) {
        super(params);
        this.name = 'Portal';
        this.spriteMode = 'custom';
    }

    setup(state) {
        if (!this.state.entryPortalPosition) {
            this.state.entryPortalPosition = Hackatron.game.getValidPosition();
        }

        if (!this.state.exitPortalPosition) {
            this.state.exitPortalPosition = Hackatron.game.getValidPosition();
        }

        // kind of a hack.. doesn't put exit in the array of powerups :-/
        // TODO: should have an array of positions the powerup uses in an array in state and use that
        this.state.position = this.state.entryPortalPosition;

        //console.log('entry x: ' + entryPortalPosition.x * 16 + '\ny: ' + entryPortalPosition.y * 16);
        //console.log('exit x: ' + exitPortalPosition.x * 16 + '\ny: ' + exitPortalPosition.y * 16);

        this.entryPortal = this.game.add.sprite(this.state.entryPortalPosition.x * 16, this.state.entryPortalPosition.y * 16, 'gfx/buffs');
        this.entryPortal.animations.add('buffLoop', ['buffs/icons/0006'], 6, true, true);
        this.entryPortal.animations.play('buffLoop');
        this.entryPortal.scale.x = 1.2;
        this.entryPortal.scale.y = 1.2;
        var tween1 = this.game.add.tween(this.entryPortal).to({alpha: 1}, 1000, 'Linear', false, 0, 0);
        var tween2 = this.game.add.tween(this.entryPortal).to({alpha: 0.5}, this.fadeTime - 2000, 'Linear', false, 0, 0);
        var tween3 = this.game.add.tween(this.entryPortal).to({alpha: 0}, 1000, 'Linear', false, 0, 0);
        tween1.chain(tween2);
        tween2.chain(tween3);
        tween1.start();

        this.exitPortal = this.game.add.sprite(this.state.exitPortalPosition.x * 16, this.state.exitPortalPosition.y * 16, 'gfx/buffs');
        this.exitPortal.animations.add('buffLoop', ['buffs/icons/0124'], 6, true, true);
        this.exitPortal.animations.play('buffLoop');
        this.exitPortal.scale.x = 1.2;
        this.exitPortal.scale.y = 1.2;
        var tween1 = this.game.add.tween(this.exitPortal).to({alpha: 1}, 1000, 'Linear', false, 0, 0);
        var tween2 = this.game.add.tween(this.exitPortal).to({alpha: 0.5}, this.fadeTime - 2000, 'Linear', false, 0, 0);
        var tween3 = this.game.add.tween(this.exitPortal).to({alpha: 0}, 1000, 'Linear', false, 0, 0);
        tween1.chain(tween2);
        tween2.chain(tween3);
        tween1.start();

        this.game.physics.arcade.enable(this.entryPortal, Phaser.Physics.ARCADE);
        this.game.physics.arcade.enable(this.exitPortal, Phaser.Physics.ARCADE);

        this.onSetup();

        this.destroyTimer = setTimeout(this.destroy.bind(this), this.fadeTime * 1.5);
    }

    start(type) {
        if (type === 'entry') {
            this.player.character.teleport(this.state.exitPortalPosition);
        } else if (type === 'exit') {
            this.player.character.teleport(this.state.entryPortalPosition);
        }

        this.onStarted();

        console.log('Powerup START: Portal');
    }

    update() {
        this.game.physics.arcade.overlap(this.player.character.sprite, this.entryPortal, this.start.bind(this, 'entry'), null, this.game);
        this.game.physics.arcade.overlap(this.player.character.sprite, this.exitPortal, this.start.bind(this, 'exit'), null, this.game);

        this.onUpdated();
    }

    stop() {
        this.finished = true;
        console.log('Powerup STOP: Portal');

        this.onStopped();
    }

    destroy() {
        if (!this.entryPortal && !this.exitPortal) { return; }

        this.entryPortal.destroy();
        this.exitPortal.destroy();
        this.entryPortal = null;
        this.exitPortal = null;

        clearTimeout(this.destroyTimer);

        this.onDestroyed();
        this.emit('destroyed', {positions: [this.state.entryPortalPosition, this.state.exitPortalPosition]});
    }
}

export default Powerup;
