const Framework = require('./Framework')
const {React, ReactDOM, ReactNative, AppWrapper, AppConfig, Platform, Component, AppRegistry, Navigator, StyleSheet, Text, View, TouchableHighlight, WebView, Animated, Dimensions, Router, Route, Link, browserHistory, Provider, syncHistoryWithStore, routerReducer, renderToString} = Framework

const SiteRouter = require('./Router').default

window.Utils = require('./Game/Core/Utils')

// TODO: Remove this hacky stuff
window.UI_state = {
    screenKey: null
}


const history = syncHistoryWithStore(browserHistory, SiteRouter.store)

class App extends Component {
    toString() { '[App]' }

    constructor(props) {
        super(props)

        // TODO: Remove this hacky stuff
        window.UI_controller = this
        this.state = window.UI_state
    }

    render() {
        return (
            <div>
                <AppWrapper config={AppConfig}>
                    <Provider store={SiteRouter.store}>
                        <div>
                            <Router history={history} routes={SiteRouter.routes} />
                        </div>
                    </Provider>
                </AppWrapper>
            </div>
        )
    }
}



////////////// PHASER GAME

window.Hackatron = {}
window.Hackatron.ready = false
window.Hackatron.screen = 'Menu'

require('./Game/States/Boot')
require('./Game/States/Preload')
require('./Game/States/Menu')
require('./Game/States/Game')

if (Utils.env.os.mobile) {
    window.Hackatron.GAME_WIDTH = 256 // Game originally designed for 512px
    window.Hackatron.GAME_HEIGHT = 256 * (window.innerHeight / window.innerWidth) // Game originally designed for 512px
} else {
    window.Hackatron.GAME_WIDTH = 600 // Game originally designed for 512px
    window.Hackatron.GAME_HEIGHT = 600 * (window.innerHeight / window.innerWidth) // Game originally designed for 512px
}

// Game Constants
window.Hackatron.UI_WIDTH = 700 //window.Hackatron.GAME_WIDTH // UI originally designed for 700px
window.Hackatron.UI_HEIGHT = 700 //window.Hackatron.GAME_HEIGHT // UI originally designed for 700px
window.Hackatron.TILE_COUNT_HORIZONTAL = 64
window.Hackatron.TILE_COUNT_VERTICAL = 64
window.Hackatron.GAME_TIME = 5000000 * 60
window.Hackatron.DEFAULT_PLAYER_SPEED = 200
window.Hackatron.POWERUP_SPAWN_INTERVAL = 2000
window.Hackatron.UPDATE_INTERVAL = 100

var gameContainer = document.getElementById('game')
var uiContainer = document.getElementById('ui')

window.Hackatron.getWidthGameScale = function() {
    return (window.innerWidth / window.Hackatron.GAME_WIDTH).toFixed(2)
}

window.Hackatron.getHeightGameScale = function() {
    return (window.innerHeight / window.Hackatron.GAME_HEIGHT).toFixed(2)
}

window.Hackatron.getWidthRatioScale = function() {
    return window.innerHeight > window.innerWidth ? 1 : (window.innerHeight / window.innerWidth).toFixed(2)
}

window.Hackatron.getHeightRatioScale = function() {
    return window.innerHeight > window.innerWidth ? (window.innerWidth / window.innerHeight).toFixed(2) : 1
}

// Resize UI
window.onresize = function() {
    var smallest = window.innerWidth < window.innerHeight ? window.innerWidth / window.Hackatron.UI_WIDTH : window.innerHeight / window.Hackatron.UI_HEIGHT
    uiContainer.style.zoom = smallest
}

// Load Game
window.Hackatron.debug = window.location.href.indexOf('localhost') !== -1
window.Hackatron.loader = new Phaser.Game(window.Hackatron.GAME_WIDTH, window.Hackatron.GAME_HEIGHT, Phaser.AUTO, gameContainer, null, true)

window.Hackatron.loader.state.add('Boot', window.Hackatron.Boot)
window.Hackatron.loader.state.add('Preload', window.Hackatron.Preload)
window.Hackatron.loader.state.add('Menu', window.Hackatron.Menu)
window.Hackatron.loader.state.add('Game', window.Hackatron.Game)

window.onresize()



window.Hackatron.fitToWindow = function() {
    if (window.Hackatron.game) {
        window.Hackatron.game.engine.canvas.style['width'] = '100%'
        window.Hackatron.game.engine.canvas.style['height'] = '100%'
    }
    //this.game.canvas.style['transform'] = 'perspective(900px) rotateX(15deg) rotate(-3deg)'
    document.getElementById('game').style['width'] = '100%' //Hackatron.getWidthRatioScale() * 100 + '%'
    document.getElementById('game').style['height'] = '100%' //Hackatron.getHeightRatioScale() * 100 + '%'

    if (Utils.env.os.mobile) {
        document.body.style['background-size'] = 'contain'
    } else {
        document.body.style['background-size'] = 'cover'
    }
    //document.getElementById('ui').style['transform'] = 'perspective(1000px) rotateX(10deg) rotate(-2deg)'
    window.onresize()
}


// Render
ReactDOM.render(<App />, document.getElementById('ui'))
