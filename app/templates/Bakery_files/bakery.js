/* jshint ignore:start */

/* jshint ignore:end */

define('bakery/adapters/application', ['exports', 'bakery/config/environment', 'firebase', 'emberfire/adapters/firebase'], function (exports, config, Firebase, FirebaseAdapter) {

  'use strict';

  exports['default'] = FirebaseAdapter['default'].extend({
    firebase: new Firebase['default'](config['default'].firebase)
  });

});
define('bakery/app', ['exports', 'ember', 'ember/resolver', 'ember/load-initializers', 'bakery/config/environment'], function (exports, Ember, Resolver, loadInitializers, config) {

  'use strict';

  var App;

  Ember['default'].MODEL_FACTORY_INJECTIONS = true;

  App = Ember['default'].Application.extend({
    modulePrefix: config['default'].modulePrefix,
    podModulePrefix: config['default'].podModulePrefix,
    Resolver: Resolver['default']
  });

  Ember['default'].deprecate = function () {};

  loadInitializers['default'](App, config['default'].modulePrefix);

  exports['default'] = App;

});
define('bakery/components/google-map', ['exports', 'ember', 'ember-google-map/core/helpers', 'ember-google-map/mixins/google-object'], function (exports, Ember, helpers, GoogleObjectMixin) {

  'use strict';

  /* globals google */
  var computed = Ember['default'].computed;
  var oneWay = computed.oneWay;
  var on = Ember['default'].on;
  var observer = Ember['default'].observer;
  var fmt = Ember['default'].String.fmt;
  var forEach = Ember['default'].EnumerableUtils.forEach;
  var getProperties = Ember['default'].getProperties;
  var $get = Ember['default'].get;
  var dummyCircle;

  var VALID_FIT_BOUND_TYPES = ['markers', 'infoWindows', 'circles', 'polylines', 'polygons'];

  function getDummyCircle(center, radius) {
    if (radius == null) {
      radius = $get(center, 'radius');
    }
    if (!(center instanceof google.maps.LatLng)) {
      center = helpers['default']._latLngToGoogle(center);
    }
    if (dummyCircle) {
      dummyCircle.setCenter(center);
      dummyCircle.setRadius(radius);
    } else {
      dummyCircle = new google.maps.Circle({ center: center, radius: radius });
    }
    return dummyCircle;
  }

  function collectCoordsOf(type, array, items) {
    if (['markers', 'infoWindows'].indexOf(type) !== -1) {
      // handle simple types
      return array.reduce(function (previous, item) {
        var coords = getProperties(item, 'lat', 'lng');
        if (coords.lat != null && coords.lng != null) {
          previous.push(coords);
        }
        return previous;
      }, items || []);
    } else if (type === 'circles') {
      // handle circles
      return array.reduce(function (previous, item) {
        var opt = getProperties(item, 'lat', 'lng', 'radius'),
            bounds;
        if (opt.lat != null && opt.lng != null && opt.radius != null) {
          bounds = getDummyCircle(opt).getBounds();
          previous.push(helpers['default']._latLngFromGoogle(bounds.getNorthEast()));
          previous.push(helpers['default']._latLngFromGoogle(bounds.getSouthWest()));
        }
        return previous;
      }, items || []);
    } else if (['polylines', 'polygons']) {
      // handle complex types
      return array.reduce(function (previous, item) {
        return $get(item, '_path').reduce(function (previous, item) {
          var coords = getProperties(item, 'lat', 'lng');
          if (coords.lat != null && coords.lng != null) {
            previous.push(coords);
          }
          return previous;
        }, items || []);
      }, items || []);
    }
  }

  function obj(o) {
    return Ember['default'].Object.create(o);
  }

  var MAP_TYPES = Ember['default'].A([obj({ id: 'road', label: 'road' }), obj({ id: 'satellite', label: 'satellite' }), obj({ id: 'terrain', label: 'terrain' }), obj({ id: 'hybrid', label: 'hybrid' })]);

  var PLACE_TYPES = Ember['default'].A([obj({ id: helpers['default'].PLACE_TYPE_ADDRESS, label: 'address' }), obj({ id: helpers['default'].PLACE_TYPE_LOCALITY, label: 'locality' }), obj({ id: helpers['default'].PLACE_TYPE_ADMIN_REGION, label: 'administrative region' }), obj({ id: helpers['default'].PLACE_TYPE_BUSINESS, label: 'business' })]);

  exports['default'] = Ember['default'].Component.extend(GoogleObjectMixin['default'], {
    googleFQCN: 'google.maps.Map',

    classNames: ['google-map'],

    /**
     * Defines all properties bound to the google map object
     * @property googleProperties
     * @type {Object}
     */
    googleProperties: {
      zoom: { event: 'zoom_changed', cast: helpers['default'].cast.integer },
      type: {
        name: 'mapTypeId',
        event: 'maptypeid_changed',
        toGoogle: helpers['default']._typeToGoogle,
        fromGoogle: helpers['default']._typeFromGoogle
      },
      'lat,lng': {
        name: 'center',
        event: 'center_changed',
        toGoogle: helpers['default']._latLngToGoogle,
        fromGoogle: helpers['default']._latLngFromGoogle
      }
      /**
       * available options (prepend with `gopt_` to use):
       * `backgroundColor`, `disableDefaultUI`, `disableDoubleClickZoom`, `draggable`, `keyboardShortcuts`,
       * `mapTypeControl`, `maxZoom`, `minZoom`, `overviewMapControl`, `panControl`, `rotateControl`, `scaleControl`,
       * `scrollwheel`, `streetViewControl`, `zoomControl`
       */
    },

    /**
     * @inheritDoc
     */
    googleEvents: {},

    /**
     * Our google map object
     * @property googleObject
     * @type {google.maps.Map}
     * @private
     */
    googleObject: null,

    /**
     * Always auto-fit bounds
     * @property alwaysAutoFitBounds
     * @type {boolean}
     */
    alwaysAutoFitBounds: false,

    /**
     * Auto fit bounds to type of items
     * @property autoFitBounds
     * @type {boolean|string}
     */
    autoFitBounds: false,

    /**
     * Fit bounds to view all coordinates
     * @property fitBoundsArray
     * @type {Array.<{lat: number, lng: number}>}
     */
    fitBoundsArray: computed('autoFitBounds', '_markers.[]', '_infoWindow.[]', '_polylines.@each._path.[]', '_polygons.@each._path.[]', '_circles.[]', function (key, value /*, oldValue*/) {
      var auto;
      if (arguments.length > 1) {
        // it's a set, save that the use defined them
        this._fixedFitBoundsArray = value;
      } else {
        if (this._fixedFitBoundsArray) {
          value = this._fixedFitBoundsArray;
        } else {
          // here comes our computation
          auto = this.get('autoFitBounds');
          if (auto) {
            auto = auto === true ? VALID_FIT_BOUND_TYPES : auto.split(',');
            value = [];
            forEach(auto, function (type) {
              collectCoordsOf(type, this.get('_' + type), value);
            }, this);
          } else {
            value = null;
          }
        }
      }
      return value;
    }),

    /**
     * Initial center's latitude of the map
     * @property lat
     * @type {Number}
     */
    lat: 0,

    /**
     * Initial center's longitude of the map
     * @property lng
     * @type {Number}
     */
    lng: 0,

    /**
     * Initial zoom of the map
     * @property zoom
     * @type {Number}
     * @default 5
     */
    zoom: 5,

    /**
     * Initial type of the map
     * @property type
     * @type {String}
     * @enum ['road', 'hybrid', 'terrain', 'satellite']
     * @default 'road'
     */
    type: 'road',

    /**
     * List of markers to handle/show on the map
     * @property markers
     * @type {Array.<{lat: Number, lng: Number, title: String}>}
     */
    markers: null,

    /**
     * The array controller holding the markers
     * @property _markers
     * @type {Ember.ArrayController}
     * @private
     */
    _markers: computed(function () {
      return this.container.lookupFactory('controller:google-map/markers').create({
        parentController: this
      });
    }).readOnly(),

    /**
     * Controller to use for each marker
     * @property markerController
     * @type {String}
     * @default 'google-map/marker'
     */
    markerController: 'google-map/marker',

    /**
     * View to use for each marker
     * @property markerViewClass
     * @type {String}
     * @default 'google-map/marker'
     */
    markerViewClass: 'google-map/marker',

    /**
     * Info-window template name to use for each marker
     * @property markerInfoWindowTemplateName
     * @type {String}
     * @default 'google-map/info-window'
     */
    markerInfoWindowTemplateName: 'google-map/info-window',

    /**
     * Whether the markers have an info-window by default
     * @property markerHasInfoWindow
     * @type {Boolean}
     * @default true
     */
    markerHasInfoWindow: true,

    /**
     * List of polylines to handle/show on the map
     * @property polylines
     * @type {Array.<{path: Array.<{lat: Number, lng: Number}>>}
     */
    polylines: null,

    /**
     * The array controller holding the polylines
     * @property _polylines
     * @type {Ember.ArrayController}
     * @private
     */
    _polylines: computed(function () {
      return this.container.lookupFactory('controller:google-map/polylines').create({
        parentController: this
      });
    }).readOnly(),

    /**
     * Controller to use for each polyline
     * @property polylineController
     * @type {String}
     * @default 'google-map/polyline'
     */
    polylineController: 'google-map/polyline',

    /**
     * Controller to use for each polyline's path
     * @property polylinePathController
     * @type {String}
     * @default 'google-map/polyline-path'
     */
    polylinePathController: 'google-map/polyline-path',

    /**
     * View to use for each polyline
     * @property polylineViewClass
     * @type {String}
     * @default 'google-map/polyline'
     */
    polylineViewClass: 'google-map/polyline',

    /**
     * List of polygons to handle/show on the map
     * @property polygons
     * @type {Array.<{path: Array.<{lat: Number, lng: Number}>>}
     */
    polygons: null,

    /**
     * The array controller holding the polygons
     * @property _polygons
     * @type {Ember.ArrayController}
     * @private
     */
    _polygons: computed(function () {
      return this.container.lookupFactory('controller:google-map/polygons').create({
        parentController: this
      });
    }).readOnly(),

    /**
     * Controller to use for each polygon
     * @property polygonController
     * @type {String}
     * @default 'google-map/polygon'
     */
    polygonController: 'google-map/polygon',

    /**
     * Controller to use for each polygon's path
     * @property polygonPathController
     * @type {String}
     * @default 'google-map/polygon-path'
     */
    polygonPathController: 'google-map/polygon-path',

    /**
     * View to use for each polygon
     * @property polygonViewClass
     * @type {String}
     * @default 'google-map/polygon'
     */
    polygonViewClass: 'google-map/polygon',

    /**
     * List of circles to handle/show on the map
     * @property circles
     * @type {Array.<{lat: Number, lng: Number, radius: Number}>}
     */
    circles: null,

    /**
     * The array controller holding the circles
     * @property _circles
     * @type {Ember.ArrayController}
     * @private
     */
    _circles: computed(function () {
      return this.container.lookupFactory('controller:google-map/circles').create({
        parentController: this
      });
    }).readOnly(),

    /**
     * Controller to use for each circle
     * @property circleController
     * @type {String}
     * @default 'google-map/circle'
     */
    circleController: 'google-map/circle',

    /**
     * View to use for each circle
     * @property circleViewClass
     * @type {String}
     * @default 'google-map/circle'
     */
    circleViewClass: 'google-map/circle',

    /**
     * Array of al info-windows to handle/show (independent from the markers' info-windows)
     * @property infoWindows
     * @type {Array.<{lat: Number, lng: Number, title: String, description: String}>}
     */
    infoWindows: null,

    /**
     * The array controller holding the info-windows
     * @property _infoWindows
     * @type {Ember.ArrayController}
     * @private
     */
    _infoWindows: computed(function () {
      return this.container.lookupFactory('controller:google-map/info-windows').create({
        parentController: this
      });
    }).readOnly(),

    /**
     * Controller for each info-window
     * @property infoWindowController
     * @type {String}
     * @default 'google-map/info-window'
     */
    infoWindowController: 'google-map/info-window',

    /**
     * View for each info-window
     * @property infoWindowViewClass
     * @type {String}
     * @default 'google-map/info-window'
     */
    infoWindowViewClass: 'google-map/info-window',

    /**
     * Template for each info-window
     * @property infoWindowTemplateName
     * @type {String}
     * @default 'google-map/info-window'
     */
    infoWindowTemplateName: 'google-map/info-window',

    /**
     * The google map object
     * @property map
     * @type {google.maps.Map}
     */
    map: oneWay('googleObject'),

    /**
     * Schedule an auto-fit of the bounds
     *
     * @method _scheduleAutoFitBounds
     */
    _scheduleAutoFitBounds: function _scheduleAutoFitBounds() {
      Ember['default'].run.schedule('afterRender', this, function () {
        Ember['default'].run.debounce(this, '_fitBounds', 200);
      });
    },

    /**
     * Observes the length of the autoFitBounds array
     *
     * @method _observesAutoFitBoundLength
     * @private
     */
    _observesAutoFitBoundLength: on('init', observer('fitBoundsArray.length', function () {
      if (this.get('alwaysAutoFitBounds')) {
        this._scheduleAutoFitBounds();
      }
    })),

    /**
     * Fit the bounds to contain given coordinates
     *
     * @method _fitBounds
     */
    _fitBounds: function _fitBounds() {
      var map, bounds, coords;
      if (this.isDestroying || this.isDestroyed) {
        return;
      }
      map = this.get('googleObject');
      if (this._state !== 'inDOM' || !map) {
        this._scheduleAutoFitBounds(coords);
        return;
      }
      coords = this.get('fitBoundsArray');
      if (!coords) {
        return;
      }
      if (Ember['default'].isArray(coords)) {
        // it's an array of lat,lng
        coords = coords.slice();
        if (coords.get('length')) {
          bounds = new google.maps.LatLngBounds(helpers['default']._latLngToGoogle(coords.shift()));
          forEach(coords, function (point) {
            bounds.extend(helpers['default']._latLngToGoogle(point));
          });
        } else {
          return;
        }
      } else {
        // it's a bound object
        bounds = helpers['default']._boundsToGoogle(coords);
      }
      if (bounds) {
        // finally make our map to fit
        map.fitBounds(bounds);
      }
    },

    /**
     * Initialize the map
     */
    initGoogleMap: on('didInsertElement', function () {
      var canvas;
      this.destroyGoogleMap();
      if (helpers['default'].hasGoogleLib()) {
        canvas = this.$('div.map-canvas')[0];
        this.createGoogleObject(canvas, null);
        this._scheduleAutoFitBounds();
      }
    }),

    /**
     * Destroy the map
     */
    destroyGoogleMap: on('willDestroyElement', function () {
      if (this.get('googleObject')) {
        Ember['default'].debug(fmt('[google-map] destroying %@', this.get('googleName')));
        this.set('googleObject', null);
      }
    })
  });

  exports.MAP_TYPES = MAP_TYPES;
  exports.PLACE_TYPES = PLACE_TYPES;

});
define('bakery/controllers/admin', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Controller.extend({
    needs: ['products'],
    authenticator: 'authenticator:torii'
  });

});
define('bakery/controllers/array', ['exports', 'ember'], function (exports, Ember) {

	'use strict';

	exports['default'] = Ember['default'].Controller;

});
define('bakery/controllers/contact', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].ArrayController.extend({
    needs: ['products'],
    selectedProductsList: null,
    isChecked: false,
    actions: {
      addContact: function addContact() {
        var checkedBoxes = [];
        var origObject = this;
        this.forEach(function (item) {
          if (item.get('selected') == true) {
            checkedBoxes.push(item.get('title'));
          }
        });
        var newContact = this.store.createRecord('contact', {
          businessName: this.get('businessName'),
          emailAddress: this.get('emailAddress'),
          //products: this.get('')
          streetAddress: this.get('streetAddress'),
          city: this.get('city'),
          state: this.get('state'),
          zip: this.get('zip'),
          phone: this.get('phone'),
          productInterest: checkedBoxes.join(', ')
        });
        debugger;

        // THIS IS FOR THE CHECKBOXES-------------
        //  THIS IS FOR THE CHECKBOXES-------------
        //  THIS IS FOR THE CHECKBOXES-------------
        //  THIS IS FOR THE CHECKBOXES-------------
        //
        //  needs: ['products', 'contact'],
        //

        //  }
        //  THIS IS FOR THE CHECKBOXES-------------
        //  THIS IS FOR THE CHECKBOXES-------------
        //  THIS IS FOR THE CHECKBOXES-------------
        //  THIS IS FOR THE CHECKBOXES-------------

        var api_key = 'AIzaSyBYLnE6A_CVHUO1RouMjmuBiMs4ZLQC2ZE';
        var addressNoSpace = this.get('streetAddress').replace(/\s/g, '');
        var url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' + addressNoSpace + this.get('city') + this.get('state') + this.get('zip') + '&key=' + api_key;
        var latlng = (function () {
          return Ember['default'].$.getJSON(url).then(function (responseJSON) {
            var lat = responseJSON.results[0].geometry.location.lat;
            var lng = responseJSON.results[0].geometry.location.lng;

            newContact.setProperties({
              lat: lat,
              lng: lng
            });
            newContact.save();
            return [lat, lng];
          });
        })();

        this.setProperties({
          businessName: ' ',
          emailAddress: ' ',
          streetAddress: ' ',
          city: ' ',
          state: ' ',
          zip: ' ',
          phone: ' '
        });
        this.transitionToRoute('products');
      }
    }
  });

});
define('bakery/controllers/contacts-map', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].ArrayController.extend({
    authenticator: 'authenticator:torii',
    zoom: 17,
    centerLat: 45.521856,
    centerLng: -122.674290
  });

});
define('bakery/controllers/contacts', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Controller.extend({
    hideMap: true,
    actions: {
      toggleMap: function toggleMap() {
        this.get('hideMap') ? this.set('hideMap', false) : this.set('hideMap', true);
      }
    }
  });

});
define('bakery/controllers/edit-product', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Controller.extend({
    needs: ['products'],
    authenticator: 'authenticator:torii',
    actions: {
      updateProduct: function updateProduct() {
        var product = this.get('model');
        product.setProperties({
          title: this.get('model.title'),
          description: this.get('model.description'),
          batchSize: this.get('model.batchSize'),
          cost: this.get('model.cost')
        });
        product.save();
        var productsController = this.get('controllers.products');
        productsController.setProperties({
          editing: true,
          viewing: false,
          adding: false
        });
        this.transitionToRoute('edit');
      },
      deleteProduct: function deleteProduct() {
        var product = this.get('model');
        product.destroyRecord();
        var productsController = this.get('controllers.products');
        productsController.setProperties({
          editing: true,
          viewing: false,
          adding: false
        });
        this.transitionToRoute('edit');
      }
    }
  });

});
define('bakery/controllers/google-map/circle', ['exports', 'ember'], function (exports, Ember) {

	'use strict';

	exports['default'] = Ember['default'].ObjectController.extend({});

});
define('bakery/controllers/google-map/circles', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].ArrayController.extend({
    itemController: Ember['default'].computed.alias('parentController.circleController'),
    model: Ember['default'].computed.alias('parentController.circles')
  });

});
define('bakery/controllers/google-map/info-window', ['exports', 'ember'], function (exports, Ember) {

	'use strict';

	exports['default'] = Ember['default'].ObjectController.extend({});

});
define('bakery/controllers/google-map/info-windows', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].ArrayController.extend({
    itemController: Ember['default'].computed.alias('parentController.infoWindowController'),
    model: Ember['default'].computed.alias('parentController.infoWindows')
  });

});
define('bakery/controllers/google-map/marker', ['exports', 'ember'], function (exports, Ember) {

	'use strict';

	exports['default'] = Ember['default'].ObjectController.extend({});

});
define('bakery/controllers/google-map/markers', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].ArrayController.extend({
    itemController: Ember['default'].computed.alias('parentController.markerController'),
    model: Ember['default'].computed.alias('parentController.markers')
  });

});
define('bakery/controllers/google-map/polygon-path', ['exports', 'bakery/controllers/google-map/polyline-path'], function (exports, GoogleMapPolylinePathController) {

	'use strict';

	exports['default'] = GoogleMapPolylinePathController['default'].extend({});

});
define('bakery/controllers/google-map/polygon', ['exports', 'bakery/controllers/google-map/polyline'], function (exports, GoogleMapPolylineController) {

	'use strict';

	exports['default'] = GoogleMapPolylineController['default'].extend({});

});
define('bakery/controllers/google-map/polygons', ['exports', 'ember', 'bakery/controllers/google-map/polylines'], function (exports, Ember, GoogleMapPolylinesController) {

  'use strict';

  exports['default'] = GoogleMapPolylinesController['default'].extend({
    itemController: Ember['default'].computed.alias('parentController.polygonController'),
    model: Ember['default'].computed.alias('parentController.polygons'),
    pathController: Ember['default'].computed.alias('parentController.polygonPathController')
  });

});
define('bakery/controllers/google-map/polyline-path', ['exports', 'ember', 'ember-google-map/mixins/google-array', 'ember-google-map/core/helpers'], function (exports, Ember, GoogleArrayMixin, helpers) {

  'use strict';

  exports['default'] = Ember['default'].ArrayController.extend(GoogleArrayMixin['default'], {
    model: Ember['default'].computed.alias('parentController.path'),
    googleItemFactory: helpers['default']._latLngToGoogle,
    emberItemFactory: function emberItemFactory(googleLatLng) {
      return Ember['default'].Object.create(helpers['default']._latLngFromGoogle(googleLatLng));
    },
    observeEmberProperties: ['lat', 'lng']
  });

});
define('bakery/controllers/google-map/polyline', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].ObjectController.extend({
    pathController: Ember['default'].computed.alias('parentController.pathController'),

    _path: Ember['default'].computed('path', 'pathController', function () {
      return this.container.lookupFactory('controller:' + this.get('pathController')).create({
        parentController: this
      });
    }).readOnly()
  });

});
define('bakery/controllers/google-map/polylines', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].ArrayController.extend({
    itemController: Ember['default'].computed.alias('parentController.polylineController'),
    model: Ember['default'].computed.alias('parentController.polylines'),
    pathController: Ember['default'].computed.alias('parentController.polylinePathController')
  });

});
define('bakery/controllers/login', ['exports', 'ember', 'simple-auth/mixins/login-controller-mixin'], function (exports, Ember, LoginControllerMixin) {

  'use strict';

  exports['default'] = Ember['default'].Controller.extend(LoginControllerMixin['default'], {
    authenticator: 'authenticator:torii'
  });

});
define('bakery/controllers/new-product', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Controller.extend({
    needs: ['products'],
    authenticator: 'authenticator:torii',
    actions: {
      createProduct: function createProduct() {
        var product = this.store.createRecord('product', {
          title: this.get('title'),
          description: this.get('description'),
          batchSize: this.get('batchSize'),
          cost: this.get('cost'),
          selected: false
        });
        product.save();
        var productsController = this.get('controllers.products');
        productsController.setProperties({
          viewing: true,
          editing: false,
          adding: false
        });
        this.setProperties({
          title: '',
          description: '',
          batchSize: '',
          cost: ''
        });
        this.transitionToRoute('products');
      }
    }
  });

});
define('bakery/controllers/object', ['exports', 'ember'], function (exports, Ember) {

	'use strict';

	exports['default'] = Ember['default'].Controller;

});
define('bakery/controllers/products', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Controller.extend({
    editing: false,
    viewing: true,
    adding: false
  });

});
define('bakery/initializers/app-version', ['exports', 'bakery/config/environment', 'ember'], function (exports, config, Ember) {

  'use strict';

  var classify = Ember['default'].String.classify;
  var registered = false;

  exports['default'] = {
    name: 'App Version',
    initialize: function initialize(container, application) {
      if (!registered) {
        var appName = classify(application.toString());
        Ember['default'].libraries.register(appName, config['default'].APP.version);
        registered = true;
      }
    }
  };

});
define('bakery/initializers/ember-google-map', ['exports', 'ember-google-map/utils/load-google-map'], function (exports, loadGoogleMap) {

  'use strict';

  exports.initialize = initialize;

  function initialize(container, application) {
    application.register('util:load-google-map', loadGoogleMap['default'], { instantiate: false });
    application.inject('route', 'loadGoogleMap', 'util:load-google-map');
  }

  exports['default'] = {
    name: 'ember-google-map',
    initialize: initialize
  };

});
define('bakery/initializers/emberfire', ['exports', 'emberfire/initializers/emberfire'], function (exports, EmberFireInitializer) {

	'use strict';

	exports['default'] = EmberFireInitializer['default'];

});
define('bakery/initializers/export-application-global', ['exports', 'ember', 'bakery/config/environment'], function (exports, Ember, config) {

  'use strict';

  exports.initialize = initialize;

  function initialize(container, application) {
    var classifiedName = Ember['default'].String.classify(config['default'].modulePrefix);

    if (config['default'].exportApplicationGlobal && !window[classifiedName]) {
      window[classifiedName] = application;
    }
  }

  ;

  exports['default'] = {
    name: 'export-application-global',

    initialize: initialize
  };

});
define('bakery/initializers/initialize-torii-callback', ['exports', 'torii/redirect-handler'], function (exports, RedirectHandler) {

  'use strict';

  exports['default'] = {
    name: 'torii-callback',
    before: 'torii',
    initialize: function initialize(container, app) {
      app.deferReadiness();
      RedirectHandler['default'].handle(window.location.toString())['catch'](function () {
        app.advanceReadiness();
      });
    }
  };

});
define('bakery/initializers/initialize-torii-session', ['exports', 'torii/configuration', 'torii/bootstrap/session'], function (exports, configuration, bootstrapSession) {

  'use strict';

  exports['default'] = {
    name: 'torii-session',
    after: 'torii',

    initialize: function initialize(container) {
      if (configuration['default'].sessionServiceName) {
        bootstrapSession['default'](container, configuration['default'].sessionServiceName);
        container.injection('adapter', configuration['default'].sessionServiceName, 'torii:session');
      }
    }
  };

});
define('bakery/initializers/initialize-torii', ['exports', 'torii/bootstrap/torii', 'torii/configuration'], function (exports, bootstrapTorii, configuration) {

  'use strict';

  var initializer = {
    name: 'torii',
    initialize: function initialize(container, app) {
      bootstrapTorii['default'](container);
      app.inject('route', 'torii', 'torii:main');
    }
  };

  if (window.DS) {
    initializer.after = 'store';
  }

  exports['default'] = initializer;

});
define('bakery/initializers/simple-auth-torii', ['exports', 'simple-auth-torii/initializer'], function (exports, initializer) {

	'use strict';

	exports['default'] = initializer['default'];

});
define('bakery/initializers/simple-auth', ['exports', 'simple-auth/configuration', 'simple-auth/setup', 'bakery/config/environment'], function (exports, Configuration, setup, ENV) {

  'use strict';

  exports['default'] = {
    name: 'simple-auth',
    initialize: function initialize(container, application) {
      Configuration['default'].load(container, ENV['default']['simple-auth'] || {});
      setup['default'](container, application);
    }
  };

});
define('bakery/models/contact', ['exports', 'ember-data'], function (exports, DS) {

  'use strict';

  exports['default'] = DS['default'].Model.extend({
    businessName: DS['default'].attr('string'),
    emailAddress: DS['default'].attr('string'),
    streetAddress: DS['default'].attr('string'),
    city: DS['default'].attr('string'),
    state: DS['default'].attr('string'),
    zip: DS['default'].attr('string'),
    phone: DS['default'].attr('string'),
    products: DS['default'].hasMany('product', { async: true }),
    productInterest: DS['default'].attr('string'),
    lat: DS['default'].attr('string'),
    lng: DS['default'].attr('string')
  });

});
define('bakery/models/dispensary', ['exports', 'ember-data'], function (exports, DS) {

	'use strict';

	exports['default'] = DS['default'].Model.extend({});

});
define('bakery/models/product', ['exports', 'ember-data'], function (exports, DS) {

  'use strict';

  exports['default'] = DS['default'].Model.extend({
    title: DS['default'].attr("string"),
    description: DS['default'].attr("string"),
    batchSize: DS['default'].attr("number"),
    cost: DS['default'].attr("number"),
    contact: DS['default'].belongsTo("contact", { async: true }),
    selected: DS['default'].attr("boolean")
  });

});
define('bakery/router', ['exports', 'ember', 'bakery/config/environment'], function (exports, Ember, config) {

  'use strict';

  var Router = Ember['default'].Router.extend({
    location: config['default'].locationType
  });

  Router.map(function () {
    this.resource('about', { path: '/' });
    this.resource('admin', function () {
      this.resource('login');
    });
    this.resource('products', function () {
      this.resource('new-product', { path: 'new' });
      this.resource('edit');
      this.resource('product', { path: ':product_id' });
      this.resource('edit-product', { path: ':product_id/edit' });
    });
    this.resource('contact');
    this.resource('contacts', function () {
      this.resource('contacts-map', function () {});
    });
    this.route('protected');
  });

  exports['default'] = Router;

});
define('bakery/routes/admin', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Route.extend({
    actions: {
      editProduct: function editProduct() {
        this.controllerFor('products').setProperties({
          'editing': true,
          'adding': false,
          'viewing': false
        });
      },
      newProduct: function newProduct() {
        this.controllerFor('products').setProperties({
          'adding': true,
          'editing': false,
          'viewing': false
        });
      },
      googleLogin: function googleLogin() {
        this.get('session').authenticate('simple-auth-authenticator:torii', 'google-oauth2');
        return;
      }
    }
  });

});
define('bakery/routes/application', ['exports', 'ember', 'simple-auth/mixins/application-route-mixin'], function (exports, Ember, ApplicationRouteMixin) {

	'use strict';

	exports['default'] = Ember['default'].Route.extend(ApplicationRouteMixin['default']);

});
define('bakery/routes/contact', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Route.extend({
    model: function model() {
      return this.store.find('product');
    }
  });

});
define('bakery/routes/contacts-map', ['exports', 'ember', 'simple-auth/mixins/authenticated-route-mixin'], function (exports, Ember, AuthenticatedRouteMixin) {

  'use strict';

  exports['default'] = Ember['default'].Route.extend(AuthenticatedRouteMixin['default'], {
    model: function model() {
      var contactCoord = Ember['default'].A();
      var contacts = this.store.find('contact').then(function (contacts) {
        contacts.forEach(function (contact) {
          contactCoord.addObject({ title: contact.get('businessName'), lat: contact.get('lat'), lng: contact.get('lng'), body: contact.get('streetAddress') + ' ' + contact.get('city') + ', ' + contact.get('state') + ' ' + contact.get('zip') });
        });
      });
      return contactCoord;
    },
    renderTemplate: function renderTemplate() {
      this.render({ outlet: 'contactsMap' });
    }
  });

});
define('bakery/routes/contacts', ['exports', 'ember', 'simple-auth/mixins/authenticated-route-mixin'], function (exports, Ember, AuthenticatedRouteMixin) {

  'use strict';

  exports['default'] = Ember['default'].Route.extend(AuthenticatedRouteMixin['default'], {
    model: function model() {
      return this.store.find('contact');
    }
  });

});
define('bakery/routes/edit-product', ['exports', 'ember', 'simple-auth/mixins/authenticated-route-mixin'], function (exports, Ember, AuthenticatedRouteMixin) {

  'use strict';

  exports['default'] = Ember['default'].Route.extend(AuthenticatedRouteMixin['default'], {
    model: function model(params) {
      return this.store.find('product', params.product_id);
    },
    renderTemplate: function renderTemplate() {
      this.render('edit-product', {
        into: 'products',
        outlet: 'editProduct'
      });
    }
  });

});
define('bakery/routes/login', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Route.extend({
    actions: {
      googleLogin: function googleLogin() {
        this.get('session').authenticate('simple-auth-authenticator:torii', 'google-oauth2');
        return;
      }
    }
  });

});
define('bakery/routes/new-product', ['exports', 'ember', 'simple-auth/mixins/authenticated-route-mixin'], function (exports, Ember, AuthenticatedRouteMixin) {

  'use strict';

  exports['default'] = Ember['default'].Route.extend(AuthenticatedRouteMixin['default'], {
    model: function model() {
      return this.store.find('product');
    },
    renderTemplate: function renderTemplate() {
      this.render('new-product', {
        into: 'products',
        outlet: 'newProduct'
      });
    }
  });

});
define('bakery/routes/product', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Route.extend({
    model: function model(params) {
      return this.store.find('product', params.product_id);
    },
    renderTemplate: function renderTemplate() {
      this.render('product', {
        into: 'products',
        outlet: 'product'
      });
    }
  });

});
define('bakery/routes/products', ['exports', 'ember'], function (exports, Ember) {

  'use strict';

  exports['default'] = Ember['default'].Route.extend({
    model: function model() {
      return this.store.find('product');
    }
  });

});
define('bakery/routes/protected', ['exports', 'ember', 'simple-auth/mixins/authenticated-route-mixin'], function (exports, Ember, AuthenticatedRouteMixin) {

	'use strict';

	exports['default'] = Ember['default'].Route.extend(AuthenticatedRouteMixin['default']);

});
define('bakery/templates/about', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"id","carousel-example-generic");
        dom.setAttribute(el1,"class","carousel slide");
        dom.setAttribute(el1,"data-ride","carousel");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment(" Indicators ");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("ol");
        dom.setAttribute(el2,"class","carousel-indicators");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("li");
        dom.setAttribute(el3,"data-target","#carousel-example-generic");
        dom.setAttribute(el3,"data-slide-to","0");
        dom.setAttribute(el3,"class","active");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("li");
        dom.setAttribute(el3,"data-target","#carousel-example-generic");
        dom.setAttribute(el3,"data-slide-to","1");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("li");
        dom.setAttribute(el3,"data-target","#carousel-example-generic");
        dom.setAttribute(el3,"data-slide-to","2");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment(" Wrapper for slides ");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","carousel-inner");
        dom.setAttribute(el2,"role","listbox");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","item active");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("img");
        dom.setAttribute(el4,"src","http://loremflickr.com/1140/500/cookie");
        dom.setAttribute(el4,"alt","...");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("div");
        dom.setAttribute(el4,"class","carousel-caption");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("h3");
        var el6 = dom.createTextNode("Custom confections available upon request.");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","item");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("img");
        dom.setAttribute(el4,"src","http://loremflickr.com/1140/500/cake");
        dom.setAttribute(el4,"alt","...");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("div");
        dom.setAttribute(el4,"class","carousel-caption");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("h3");
        var el6 = dom.createTextNode("Browse our ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("a");
        dom.setAttribute(el6,"href","products");
        var el7 = dom.createTextNode("products");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode(".");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","item");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("img");
        dom.setAttribute(el4,"src","http://loremflickr.com/1140/500/pie");
        dom.setAttribute(el4,"alt","...");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("div");
        dom.setAttribute(el4,"class","carousel-caption");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("h3");
        var el6 = dom.createElement("a");
        dom.setAttribute(el6,"href","contact");
        var el7 = dom.createTextNode("Contact Us");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode(" for more information about ordering.");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment(" Controls ");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("a");
        dom.setAttribute(el2,"class","left carousel-control");
        dom.setAttribute(el2,"href","#carousel-example-generic");
        dom.setAttribute(el2,"role","button");
        dom.setAttribute(el2,"data-slide","prev");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("span");
        dom.setAttribute(el3,"class","glyphicon glyphicon-chevron-left");
        dom.setAttribute(el3,"aria-hidden","true");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("span");
        dom.setAttribute(el3,"class","sr-only");
        var el4 = dom.createTextNode("Previous");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("a");
        dom.setAttribute(el2,"class","right carousel-control");
        dom.setAttribute(el2,"href","#carousel-example-generic");
        dom.setAttribute(el2,"role","button");
        dom.setAttribute(el2,"data-slide","next");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("span");
        dom.setAttribute(el3,"class","glyphicon glyphicon-chevron-right");
        dom.setAttribute(el3,"aria-hidden","true");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("span");
        dom.setAttribute(el3,"class","sr-only");
        var el4 = dom.createTextNode("Next");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/admin', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      var child0 = (function() {
        return {
          isHTMLBars: true,
          revision: "Ember@1.12.0",
          blockParams: 0,
          cachedFragment: null,
          hasRendered: false,
          build: function build(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            var el2 = dom.createTextNode("\n          Add new product\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          render: function render(context, env, contextualElement) {
            var dom = env.dom;
            var hooks = env.hooks, element = hooks.element;
            dom.detectNamespace(contextualElement);
            var fragment;
            if (env.useFragmentCache && dom.canClone) {
              if (this.cachedFragment === null) {
                fragment = this.build(dom);
                if (this.hasRendered) {
                  this.cachedFragment = fragment;
                } else {
                  this.hasRendered = true;
                }
              }
              if (this.cachedFragment) {
                fragment = dom.cloneNode(this.cachedFragment, true);
              }
            } else {
              fragment = this.build(dom);
            }
            var element1 = dom.childAt(fragment, [1]);
            element(env, element1, context, "action", ["newProduct"], {});
            return fragment;
          }
        };
      }());
      var child1 = (function() {
        return {
          isHTMLBars: true,
          revision: "Ember@1.12.0",
          blockParams: 0,
          cachedFragment: null,
          hasRendered: false,
          build: function build(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            var el2 = dom.createTextNode("\n          Edit a product\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          render: function render(context, env, contextualElement) {
            var dom = env.dom;
            var hooks = env.hooks, element = hooks.element;
            dom.detectNamespace(contextualElement);
            var fragment;
            if (env.useFragmentCache && dom.canClone) {
              if (this.cachedFragment === null) {
                fragment = this.build(dom);
                if (this.hasRendered) {
                  this.cachedFragment = fragment;
                } else {
                  this.hasRendered = true;
                }
              }
              if (this.cachedFragment) {
                fragment = dom.cloneNode(this.cachedFragment, true);
              }
            } else {
              fragment = this.build(dom);
            }
            var element0 = dom.childAt(fragment, [1]);
            element(env, element0, context, "action", ["editProduct"], {});
            return fragment;
          }
        };
      }());
      var child2 = (function() {
        return {
          isHTMLBars: true,
          revision: "Ember@1.12.0",
          blockParams: 0,
          cachedFragment: null,
          hasRendered: false,
          build: function build(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            var el2 = dom.createTextNode("\n          View Contacts\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          render: function render(context, env, contextualElement) {
            var dom = env.dom;
            dom.detectNamespace(contextualElement);
            var fragment;
            if (env.useFragmentCache && dom.canClone) {
              if (this.cachedFragment === null) {
                fragment = this.build(dom);
                if (this.hasRendered) {
                  this.cachedFragment = fragment;
                } else {
                  this.hasRendered = true;
                }
              }
              if (this.cachedFragment) {
                fragment = dom.cloneNode(this.cachedFragment, true);
              }
            } else {
              fragment = this.build(dom);
            }
            return fragment;
          }
        };
      }());
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","btn-group");
          dom.setAttribute(el1,"role","group");
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","btn-group");
          dom.setAttribute(el1,"role","group");
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","btn-group");
          dom.setAttribute(el1,"role","group");
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","btn-group");
          dom.setAttribute(el1,"role","group");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("a");
          dom.setAttribute(el2,"class","btn btn-info");
          var el3 = dom.createTextNode("\n        Logout\n      ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, block = hooks.block, element = hooks.element;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var element2 = dom.childAt(fragment, [7, 1]);
          var morph0 = dom.createMorphAt(dom.childAt(fragment, [1]),1,1);
          var morph1 = dom.createMorphAt(dom.childAt(fragment, [3]),1,1);
          var morph2 = dom.createMorphAt(dom.childAt(fragment, [5]),1,1);
          block(env, morph0, context, "link-to", ["new-product"], {"class": "btn btn-success"}, child0, null);
          block(env, morph1, context, "link-to", ["edit"], {"class": "btn btn-warning"}, child1, null);
          block(env, morph2, context, "link-to", ["contacts"], {"class": "btn btn-primary"}, child2, null);
          element(env, element2, context, "action", ["invalidateSession"], {});
          return fragment;
        }
      };
    }());
    var child1 = (function() {
      var child0 = (function() {
        return {
          isHTMLBars: true,
          revision: "Ember@1.12.0",
          blockParams: 0,
          cachedFragment: null,
          hasRendered: false,
          build: function build(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createElement("div");
            var el2 = dom.createTextNode("\n          Login\n        ");
            dom.appendChild(el1, el2);
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          render: function render(context, env, contextualElement) {
            var dom = env.dom;
            dom.detectNamespace(contextualElement);
            var fragment;
            if (env.useFragmentCache && dom.canClone) {
              if (this.cachedFragment === null) {
                fragment = this.build(dom);
                if (this.hasRendered) {
                  this.cachedFragment = fragment;
                } else {
                  this.hasRendered = true;
                }
              }
              if (this.cachedFragment) {
                fragment = dom.cloneNode(this.cachedFragment, true);
              }
            } else {
              fragment = this.build(dom);
            }
            return fragment;
          }
        };
      }());
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","btn-group");
          dom.setAttribute(el1,"role","group");
          var el2 = dom.createTextNode("\n");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, block = hooks.block;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(dom.childAt(fragment, [1]),1,1);
          block(env, morph0, context, "link-to", ["login"], {"class": "btn btn-info"}, child0, null);
          return fragment;
        }
      };
    }());
    var child2 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          return fragment;
        }
      };
    }());
    var child3 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, content = hooks.content;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
          content(env, morph0, context, "outlet");
          return fragment;
        }
      };
    }());
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","btn-group btn-group-justified");
        dom.setAttribute(el1,"role","group");
        dom.setAttribute(el1,"aria-label","...");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("br");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","col-md-6 col-md-offset-3");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, block = hooks.block;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var morph0 = dom.createMorphAt(dom.childAt(fragment, [0]),1,1);
        var morph1 = dom.createMorphAt(dom.childAt(fragment, [4]),1,1);
        block(env, morph0, context, "if", [get(env, context, "session.isAuthenticated")], {}, child0, child1);
        block(env, morph1, context, "if", [get(env, context, "session.isAuthenticated")], {}, child2, child3);
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/application', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","glyphicon glyphicon-grain");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          return fragment;
        }
      };
    }());
    var child1 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("Administrator");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          return fragment;
        }
      };
    }());
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("nav");
        dom.setAttribute(el1,"id","outer-navbar");
        dom.setAttribute(el1,"class","navbar navbar-default");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"id","inner-navbar");
        dom.setAttribute(el2,"class","container-fluid");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment(" Brand and toggle get grouped for better mobile display ");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","navbar-header text-center");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("button");
        dom.setAttribute(el4,"type","button");
        dom.setAttribute(el4,"class","navbar-toggle collapsed");
        dom.setAttribute(el4,"data-toggle","collapse");
        dom.setAttribute(el4,"data-target","#bs-example-navbar-collapse-1");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("span");
        dom.setAttribute(el5,"class","sr-only");
        var el6 = dom.createTextNode("Toggle navigation");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("span");
        dom.setAttribute(el5,"class","icon-bar");
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("span");
        dom.setAttribute(el5,"class","icon-bar");
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("span");
        dom.setAttribute(el5,"class","icon-bar");
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","collapse navbar-collapse");
        dom.setAttribute(el3,"id","bs-example-navbar-collapse-1");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("ul");
        dom.setAttribute(el4,"class","nav navbar-nav");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createComment(" <li class=\"active\"><a href=\"/\">Home</a></li> ");
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("li");
        var el6 = dom.createElement("a");
        dom.setAttribute(el6,"href","products");
        var el7 = dom.createTextNode("Products");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("li");
        var el6 = dom.createElement("a");
        dom.setAttribute(el6,"href","contact");
        var el7 = dom.createTextNode("Contact Us");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("ul");
        dom.setAttribute(el4,"class","nav navbar-nav navbar-right");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("li");
        var el6 = dom.createComment("");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createComment(" /.navbar-collapse ");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createComment(" /.container-fluid ");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","container");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, block = hooks.block, content = hooks.content;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var element0 = dom.childAt(fragment, [0, 1]);
        var morph0 = dom.createMorphAt(dom.childAt(element0, [3]),3,3);
        var morph1 = dom.createMorphAt(dom.childAt(element0, [5, 3, 1]),0,0);
        var morph2 = dom.createMorphAt(dom.childAt(fragment, [2]),1,1);
        block(env, morph0, context, "link-to", ["about"], {"class": "navbar-brand"}, child0, null);
        block(env, morph1, context, "link-to", ["admin"], {"class": "navbar-brand"}, child1, null);
        content(env, morph2, context, "outlet");
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/components/google-map', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      var child0 = (function() {
        return {
          isHTMLBars: true,
          revision: "Ember@1.12.0",
          blockParams: 0,
          cachedFragment: null,
          hasRendered: false,
          build: function build(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("        ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          render: function render(context, env, contextualElement) {
            var dom = env.dom;
            var hooks = env.hooks, get = hooks.get, inline = hooks.inline;
            dom.detectNamespace(contextualElement);
            var fragment;
            if (env.useFragmentCache && dom.canClone) {
              if (this.cachedFragment === null) {
                fragment = this.build(dom);
                if (this.hasRendered) {
                  this.cachedFragment = fragment;
                } else {
                  this.hasRendered = true;
                }
              }
              if (this.cachedFragment) {
                fragment = dom.cloneNode(this.cachedFragment, true);
              }
            } else {
              fragment = this.build(dom);
            }
            var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
            inline(env, morph0, context, "view", ["google-map/info-window"], {"context": get(env, context, "marker")});
            return fragment;
          }
        };
      }());
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("li");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode(" @ ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode(",");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, content = hooks.content, get = hooks.get, block = hooks.block;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var element0 = dom.childAt(fragment, [1]);
          var morph0 = dom.createMorphAt(element0,0,0);
          var morph1 = dom.createMorphAt(element0,2,2);
          var morph2 = dom.createMorphAt(element0,4,4);
          var morph3 = dom.createMorphAt(fragment,3,3,contextualElement);
          dom.insertBoundary(fragment, null);
          content(env, morph0, context, "marker.title");
          content(env, morph1, context, "marker.lat");
          content(env, morph2, context, "marker.lng");
          block(env, morph3, context, "if", [get(env, context, "view.hasInfoWindow")], {}, child0, null);
          return fragment;
        }
      };
    }());
    var child1 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("      ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, get = hooks.get, inline = hooks.inline;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
          inline(env, morph0, context, "view", [get(env, context, "infoWindowViewClass")], {"context": get(env, context, "iw")});
          return fragment;
        }
      };
    }());
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","map-canvas");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"style","display: none;");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("ul");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("ul");
        var el3 = dom.createTextNode("\n");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("ul");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("ul");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("ul");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, block = hooks.block, inline = hooks.inline;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var element1 = dom.childAt(fragment, [2]);
        var morph0 = dom.createMorphAt(dom.childAt(element1, [1]),1,1);
        var morph1 = dom.createMorphAt(dom.childAt(element1, [3]),1,1);
        var morph2 = dom.createMorphAt(dom.childAt(element1, [5]),1,1);
        var morph3 = dom.createMorphAt(dom.childAt(element1, [7]),1,1);
        var morph4 = dom.createMorphAt(dom.childAt(element1, [9]),1,1);
        block(env, morph0, context, "each", [get(env, context, "_markers")], {"itemViewClass": get(env, context, "markerViewClass"), "keyword": "marker"}, child0, null);
        block(env, morph1, context, "each", [get(env, context, "_infoWindows")], {"keyword": "iw"}, child1, null);
        inline(env, morph2, context, "each", [get(env, context, "_polylines")], {"itemViewClass": get(env, context, "polylineViewClass"), "keyword": "polyline"});
        inline(env, morph3, context, "each", [get(env, context, "_polygons")], {"itemViewClass": get(env, context, "polygonViewClass"), "keyword": "polygon"});
        inline(env, morph4, context, "each", [get(env, context, "_circles")], {"itemViewClass": get(env, context, "circleViewClass"), "keyword": "circle"});
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/contact', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("        ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          dom.setAttribute(el1,"class","col-md-4");
          var el2 = dom.createTextNode("\n          ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode(" ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n          ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("br");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, get = hooks.get, inline = hooks.inline, content = hooks.content;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var element0 = dom.childAt(fragment, [1]);
          var morph0 = dom.createMorphAt(element0,1,1);
          var morph1 = dom.createMorphAt(element0,3,3);
          inline(env, morph0, context, "input", [], {"type": "checkbox", "name": get(env, context, "product.title"), "checked": get(env, context, "product.selected"), "class": "checkbox", "action": "checkBox"});
          content(env, morph1, context, "product.title");
          return fragment;
        }
      };
    }());
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","panel panel-default");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","panel-heading");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("h3");
        dom.setAttribute(el3,"class","panel-title");
        var el4 = dom.createTextNode("CONTACT US");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","panel-body");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("form");
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment(" CHECKBOXES ");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("h3");
        var el5 = dom.createTextNode("Please Check all the Products You're Interested In: ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("    ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("hr");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("br");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n  ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment(" CHECKBOXES ");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("br");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("br");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("br");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("br");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment(" {{input type=\"text\" placeholder=\"Products Interested In\" value=Product}} ");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","panel-footer");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("button");
        dom.setAttribute(el3,"class","btn btn-danger btn-block");
        var el4 = dom.createTextNode("Submit");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, block = hooks.block, inline = hooks.inline, element = hooks.element;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var element1 = dom.childAt(fragment, [0]);
        var element2 = dom.childAt(element1, [3, 1]);
        var element3 = dom.childAt(element1, [5, 1]);
        var morph0 = dom.createMorphAt(element2,5,5);
        var morph1 = dom.createMorphAt(element2,13,13);
        var morph2 = dom.createMorphAt(element2,17,17);
        var morph3 = dom.createMorphAt(element2,21,21);
        var morph4 = dom.createMorphAt(element2,25,25);
        var morph5 = dom.createMorphAt(element2,27,27);
        var morph6 = dom.createMorphAt(element2,29,29);
        var morph7 = dom.createMorphAt(element2,33,33);
        block(env, morph0, context, "each", [get(env, context, "model")], {"keyword": "product"}, child0, null);
        inline(env, morph1, context, "input", [], {"type": "text", "placeholder": "Business Name", "value": get(env, context, "businessName"), "class": "form-control"});
        inline(env, morph2, context, "input", [], {"type": "text", "placeholder": "Email", "value": get(env, context, "emailAddress"), "class": "form-control"});
        inline(env, morph3, context, "input", [], {"type": "text", "placeholder": "Address", "value": get(env, context, "streetAddress"), "class": "form-control"});
        inline(env, morph4, context, "input", [], {"type": "text", "placeholder": "City", "value": get(env, context, "city"), "class": "address"});
        inline(env, morph5, context, "input", [], {"type": "text", "placeholder": "State", "value": get(env, context, "state"), "class": "address"});
        inline(env, morph6, context, "input", [], {"type": "text", "placeholder": "Zip Code", "value": get(env, context, "zip"), "class": "address"});
        inline(env, morph7, context, "input", [], {"type": "text", "placeholder": "Phone Number", "value": get(env, context, "phone"), "class": "form-control"});
        element(env, element3, context, "action", ["addContact"], {});
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/contacts-map', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h1");
        var el2 = dom.createTextNode("Contacts Map!");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","controls");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("label");
        var el3 = dom.createTextNode("\n    Zoom:\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, inline = hooks.inline;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var morph0 = dom.createMorphAt(fragment,2,2,contextualElement);
        var morph1 = dom.createMorphAt(dom.childAt(fragment, [4, 1]),1,1);
        inline(env, morph0, context, "google-map", [], {"gopt_zoomControl": true, "markerInfoWindowTemplateName": "info-window", "markers": get(env, context, "model"), "lat": get(env, context, "centerLat"), "lng": get(env, context, "centerLng"), "zoom": get(env, context, "zoom"), "gopt_zoomControl": false, "type": "street", "scaleControl": true, "panControl": false});
        inline(env, morph1, context, "input", [], {"type": "range", "value": get(env, context, "zoom"), "min": 0, "max": 18, "step": 1});
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/contacts', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      var child0 = (function() {
        return {
          isHTMLBars: true,
          revision: "Ember@1.12.0",
          blockParams: 0,
          cachedFragment: null,
          hasRendered: false,
          build: function build(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode(" Open Map ");
            dom.appendChild(el0, el1);
            return el0;
          },
          render: function render(context, env, contextualElement) {
            var dom = env.dom;
            dom.detectNamespace(contextualElement);
            var fragment;
            if (env.useFragmentCache && dom.canClone) {
              if (this.cachedFragment === null) {
                fragment = this.build(dom);
                if (this.hasRendered) {
                  this.cachedFragment = fragment;
                } else {
                  this.hasRendered = true;
                }
              }
              if (this.cachedFragment) {
                fragment = dom.cloneNode(this.cachedFragment, true);
              }
            } else {
              fragment = this.build(dom);
            }
            return fragment;
          }
        };
      }());
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, element = hooks.element, block = hooks.block;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var element4 = dom.childAt(fragment, [1]);
          var morph0 = dom.createMorphAt(element4,1,1);
          element(env, element4, context, "action", ["toggleMap"], {});
          block(env, morph0, context, "link-to", ["contacts-map"], {"class": "btn btn-info btn-block"}, child0, null);
          return fragment;
        }
      };
    }());
    var child1 = (function() {
      var child0 = (function() {
        return {
          isHTMLBars: true,
          revision: "Ember@1.12.0",
          blockParams: 0,
          cachedFragment: null,
          hasRendered: false,
          build: function build(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode(" Close Map ");
            dom.appendChild(el0, el1);
            return el0;
          },
          render: function render(context, env, contextualElement) {
            var dom = env.dom;
            dom.detectNamespace(contextualElement);
            var fragment;
            if (env.useFragmentCache && dom.canClone) {
              if (this.cachedFragment === null) {
                fragment = this.build(dom);
                if (this.hasRendered) {
                  this.cachedFragment = fragment;
                } else {
                  this.hasRendered = true;
                }
              }
              if (this.cachedFragment) {
                fragment = dom.cloneNode(this.cachedFragment, true);
              }
            } else {
              fragment = this.build(dom);
            }
            return fragment;
          }
        };
      }());
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("div");
          var el2 = dom.createTextNode("\n      ");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n    ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, element = hooks.element, block = hooks.block;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var element3 = dom.childAt(fragment, [1]);
          var morph0 = dom.createMorphAt(element3,1,1);
          element(env, element3, context, "action", ["toggleMap"], {});
          block(env, morph0, context, "link-to", ["contacts"], {"class": "btn btn-warning btn-block"}, child0, null);
          return fragment;
        }
      };
    }());
    var child2 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("        ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("tr");
          var el2 = dom.createTextNode("\n          ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("td");
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n          ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("td");
          var el3 = dom.createElement("a");
          var el4 = dom.createComment("");
          dom.appendChild(el3, el4);
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n          ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("td");
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n          ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("td");
          var el3 = dom.createTextNode("\n            ");
          dom.appendChild(el2, el3);
          var el3 = dom.createElement("address");
          var el4 = dom.createTextNode("\n              ");
          dom.appendChild(el3, el4);
          var el4 = dom.createComment("");
          dom.appendChild(el3, el4);
          var el4 = dom.createElement("br");
          dom.appendChild(el3, el4);
          var el4 = dom.createTextNode("\n              ");
          dom.appendChild(el3, el4);
          var el4 = dom.createComment("");
          dom.appendChild(el3, el4);
          var el4 = dom.createTextNode(", ");
          dom.appendChild(el3, el4);
          var el4 = dom.createComment("");
          dom.appendChild(el3, el4);
          var el4 = dom.createTextNode(" ");
          dom.appendChild(el3, el4);
          var el4 = dom.createComment("");
          dom.appendChild(el3, el4);
          var el4 = dom.createTextNode("\n            ");
          dom.appendChild(el3, el4);
          dom.appendChild(el2, el3);
          var el3 = dom.createTextNode("\n          ");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n          ");
          dom.appendChild(el1, el2);
          var el2 = dom.createElement("td");
          var el3 = dom.createComment("");
          dom.appendChild(el2, el3);
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode("\n        ");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, content = hooks.content, get = hooks.get, concat = hooks.concat, attribute = hooks.attribute;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var element0 = dom.childAt(fragment, [1]);
          var element1 = dom.childAt(element0, [3, 0]);
          var element2 = dom.childAt(element0, [7, 1]);
          var morph0 = dom.createMorphAt(dom.childAt(element0, [1]),0,0);
          var morph1 = dom.createMorphAt(element1,0,0);
          var attrMorph0 = dom.createAttrMorph(element1, 'href');
          var morph2 = dom.createMorphAt(dom.childAt(element0, [5]),0,0);
          var morph3 = dom.createMorphAt(element2,1,1);
          var morph4 = dom.createMorphAt(element2,4,4);
          var morph5 = dom.createMorphAt(element2,6,6);
          var morph6 = dom.createMorphAt(element2,8,8);
          var morph7 = dom.createMorphAt(dom.childAt(element0, [9]),0,0);
          content(env, morph0, context, "contact.businessName");
          attribute(env, attrMorph0, element1, "href", concat(env, ["mailto:", get(env, context, "contact.emailAddress")]));
          content(env, morph1, context, "contact.emailAddress");
          content(env, morph2, context, "contact.phone");
          content(env, morph3, context, "contact.streetAddress");
          content(env, morph4, context, "contact.city");
          content(env, morph5, context, "contact.state");
          content(env, morph6, context, "contact.zip");
          content(env, morph7, context, "contact.productInterest");
          return fragment;
        }
      };
    }());
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","col-md-7");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("br");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("br");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","well col-md-7");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("table");
        dom.setAttribute(el2,"class","table table-striped table-bordered table-condensed");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("thead");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("tr");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("th");
        var el6 = dom.createTextNode("Business Name");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("th");
        var el6 = dom.createTextNode("Email");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("th");
        var el6 = dom.createTextNode("Phone");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("th");
        var el6 = dom.createTextNode("Address");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("th");
        var el6 = dom.createTextNode("Product Interests");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("tbody");
        var el4 = dom.createTextNode("\n");
        dom.appendChild(el3, el4);
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","col-md-5");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, block = hooks.block, inline = hooks.inline;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var morph0 = dom.createMorphAt(dom.childAt(fragment, [0]),1,1);
        var morph1 = dom.createMorphAt(dom.childAt(fragment, [5, 1, 3]),1,1);
        var morph2 = dom.createMorphAt(dom.childAt(fragment, [7]),1,1);
        block(env, morph0, context, "if", [get(env, context, "hideMap")], {}, child0, child1);
        block(env, morph1, context, "each", [get(env, context, "model")], {"keyword": "contact"}, child2, null);
        inline(env, morph2, context, "outlet", ["contactsMap"], {});
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/edit-product', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","col-md-6");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","panel panel-default");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","panel-heading");
        var el4 = dom.createTextNode("\n\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("h3");
        dom.setAttribute(el4,"class","text-center");
        var el5 = dom.createTextNode("Edit ");
        dom.appendChild(el4, el5);
        var el5 = dom.createComment("");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","panel-body");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("form");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5,"class","form-horizontal");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6,"class","form-group");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("label");
        dom.setAttribute(el7,"for","title");
        dom.setAttribute(el7,"class","col-md-4 control-label");
        var el8 = dom.createTextNode("Product Title");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7,"class","col-md-8");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5,"class","form-horizontal");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6,"class","form-group");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("label");
        dom.setAttribute(el7,"for","description");
        dom.setAttribute(el7,"class","col-md-4 control-label");
        var el8 = dom.createTextNode("Description");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7,"class","col-md-8");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5,"class","form-horizontal");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6,"class","form-group");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("label");
        dom.setAttribute(el7,"for","type");
        dom.setAttribute(el7,"class","col-md-4 control-label");
        var el8 = dom.createTextNode("Batch size");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7,"class","col-md-8");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5,"class","form-horizontal");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6,"class","form-group");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("label");
        dom.setAttribute(el7,"for","date");
        dom.setAttribute(el7,"class","col-md-4 control-label");
        var el8 = dom.createTextNode("Cost");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7,"class","col-md-8");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createElement("div");
        dom.setAttribute(el8,"class","input-group");
        var el9 = dom.createTextNode("\n                ");
        dom.appendChild(el8, el9);
        var el9 = dom.createElement("div");
        dom.setAttribute(el9,"class","input-group-addon");
        var el10 = dom.createTextNode("$");
        dom.appendChild(el9, el10);
        dom.appendChild(el8, el9);
        var el9 = dom.createTextNode("\n                  ");
        dom.appendChild(el8, el9);
        var el9 = dom.createComment("");
        dom.appendChild(el8, el9);
        var el9 = dom.createTextNode("\n              ");
        dom.appendChild(el8, el9);
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5,"class","col-md-8 col-md-offset-4 stretch");
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","panel-footer");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("button");
        dom.setAttribute(el4,"name","button");
        dom.setAttribute(el4,"class","btn btn-info btn-block");
        var el5 = dom.createTextNode("Update product");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("button");
        dom.setAttribute(el4,"name","button");
        dom.setAttribute(el4,"class","btn btn-danger btn-block");
        var el5 = dom.createTextNode("Delete product");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, content = hooks.content, get = hooks.get, inline = hooks.inline, element = hooks.element;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var element0 = dom.childAt(fragment, [0, 1]);
        var element1 = dom.childAt(element0, [3, 1]);
        var element2 = dom.childAt(element0, [5]);
        var element3 = dom.childAt(element2, [1]);
        var element4 = dom.childAt(element2, [3]);
        var morph0 = dom.createMorphAt(dom.childAt(element0, [1, 1]),1,1);
        var morph1 = dom.createMorphAt(dom.childAt(element1, [1, 1, 3]),1,1);
        var morph2 = dom.createMorphAt(dom.childAt(element1, [3, 1, 3]),1,1);
        var morph3 = dom.createMorphAt(dom.childAt(element1, [5, 1, 3]),1,1);
        var morph4 = dom.createMorphAt(dom.childAt(element1, [7, 1, 3, 1]),3,3);
        content(env, morph0, context, "model.title");
        inline(env, morph1, context, "input", [], {"value": get(env, context, "model.title"), "type": "text", "class": "form-control"});
        inline(env, morph2, context, "textarea", [], {"value": get(env, context, "model.description"), "rows": 5, "class": "form-control"});
        inline(env, morph3, context, "input", [], {"value": get(env, context, "model.batchSize"), "type": "number", "class": "form-control", "step": "1"});
        inline(env, morph4, context, "input", [], {"value": get(env, context, "model.cost"), "type": "number", "class": "form-control"});
        element(env, element3, context, "action", ["updateProduct"], {});
        element(env, element4, context, "action", ["deleteProduct"], {});
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/google-map/info-window', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h3");
        dom.setAttribute(el1,"style","margin-top: 0;");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("p");
        dom.setAttribute(el1,"style","margin-bottom: 0;");
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, content = hooks.content;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var morph0 = dom.createMorphAt(dom.childAt(fragment, [0]),0,0);
        var morph1 = dom.createMorphAt(dom.childAt(fragment, [2]),0,0);
        content(env, morph0, context, "title");
        content(env, morph1, context, "description");
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/google-map/polyline', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createElement("li");
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          var el2 = dom.createTextNode(",");
          dom.appendChild(el1, el2);
          var el2 = dom.createComment("");
          dom.appendChild(el1, el2);
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, content = hooks.content;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var element0 = dom.childAt(fragment, [1]);
          var morph0 = dom.createMorphAt(element0,0,0);
          var morph1 = dom.createMorphAt(element0,2,2);
          content(env, morph0, context, "point.lat");
          content(env, morph1, context, "point.lng");
          return fragment;
        }
      };
    }());
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("ul");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, block = hooks.block;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var morph0 = dom.createMorphAt(dom.childAt(fragment, [0]),1,1);
        block(env, morph0, context, "each", [get(env, context, "_path")], {"keyword": "point"}, child0, null);
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/login', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","well");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("h3");
        var el3 = dom.createTextNode("Login Route");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("button");
        var el3 = dom.createTextNode("Login with Google");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, element = hooks.element;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var element0 = dom.childAt(fragment, [0, 3]);
        element(env, element0, context, "action", ["googleLogin"], {});
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/new-product', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","col-md-6");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","panel panel-default");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","panel-heading");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("h3");
        dom.setAttribute(el4,"class","panel-title");
        var el5 = dom.createTextNode("Create a new product");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","panel-body");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("form");
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5,"class","form-horizontal");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6,"class","form-group");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("label");
        dom.setAttribute(el7,"for","title");
        dom.setAttribute(el7,"class","col-md-4 control-label");
        var el8 = dom.createTextNode("Product Title");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7,"class","col-md-8");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5,"class","form-horizontal");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6,"class","form-group");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("label");
        dom.setAttribute(el7,"for","description");
        dom.setAttribute(el7,"class","col-md-4 control-label");
        var el8 = dom.createTextNode("Description");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7,"class","col-md-8");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5,"class","form-horizontal");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6,"class","form-group");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("label");
        dom.setAttribute(el7,"for","type");
        dom.setAttribute(el7,"class","col-md-4 control-label");
        var el8 = dom.createTextNode("Batch size");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7,"class","col-md-8");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createComment("");
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n        ");
        dom.appendChild(el4, el5);
        var el5 = dom.createElement("div");
        dom.setAttribute(el5,"class","form-horizontal");
        var el6 = dom.createTextNode("\n          ");
        dom.appendChild(el5, el6);
        var el6 = dom.createElement("div");
        dom.setAttribute(el6,"class","form-group");
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("label");
        dom.setAttribute(el7,"for","date");
        dom.setAttribute(el7,"class","col-md-4 control-label");
        var el8 = dom.createTextNode("Cost");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n            ");
        dom.appendChild(el6, el7);
        var el7 = dom.createElement("div");
        dom.setAttribute(el7,"class","col-md-8");
        var el8 = dom.createTextNode("\n              ");
        dom.appendChild(el7, el8);
        var el8 = dom.createElement("div");
        dom.setAttribute(el8,"class","input-group");
        var el9 = dom.createTextNode("\n                ");
        dom.appendChild(el8, el9);
        var el9 = dom.createElement("div");
        dom.setAttribute(el9,"class","input-group-addon");
        var el10 = dom.createTextNode("$");
        dom.appendChild(el9, el10);
        dom.appendChild(el8, el9);
        var el9 = dom.createTextNode("\n                  ");
        dom.appendChild(el8, el9);
        var el9 = dom.createComment("");
        dom.appendChild(el8, el9);
        var el9 = dom.createTextNode("\n              ");
        dom.appendChild(el8, el9);
        dom.appendChild(el7, el8);
        var el8 = dom.createTextNode("\n            ");
        dom.appendChild(el7, el8);
        dom.appendChild(el6, el7);
        var el7 = dom.createTextNode("\n          ");
        dom.appendChild(el6, el7);
        dom.appendChild(el5, el6);
        var el6 = dom.createTextNode("\n        ");
        dom.appendChild(el5, el6);
        dom.appendChild(el4, el5);
        var el5 = dom.createTextNode("\n\n      ");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","panel-footer");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("button");
        dom.setAttribute(el4,"name","button");
        dom.setAttribute(el4,"class","btn btn-info btn-block");
        var el5 = dom.createTextNode("Create new product");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, inline = hooks.inline, element = hooks.element;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var element0 = dom.childAt(fragment, [0, 1]);
        var element1 = dom.childAt(element0, [3, 1]);
        var element2 = dom.childAt(element0, [5, 1]);
        var morph0 = dom.createMorphAt(dom.childAt(element1, [1, 1, 3]),1,1);
        var morph1 = dom.createMorphAt(dom.childAt(element1, [3, 1, 3]),1,1);
        var morph2 = dom.createMorphAt(dom.childAt(element1, [5, 1, 3]),1,1);
        var morph3 = dom.createMorphAt(dom.childAt(element1, [7, 1, 3, 1]),3,3);
        inline(env, morph0, context, "input", [], {"value": get(env, context, "title"), "type": "text", "class": "form-control"});
        inline(env, morph1, context, "textarea", [], {"value": get(env, context, "description"), "rows": 5, "class": "form-control"});
        inline(env, morph2, context, "input", [], {"value": get(env, context, "batchSize"), "type": "number", "class": "form-control", "step": "1"});
        inline(env, morph3, context, "input", [], {"value": get(env, context, "cost"), "type": "number", "class": "form-control"});
        element(env, element2, context, "action", ["createProduct"], {});
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/product', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","panel panel-default");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","panel-heading");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("h3");
        var el4 = dom.createComment("");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("div");
        dom.setAttribute(el2,"class","panel-body");
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createElement("div");
        dom.setAttribute(el3,"class","lead alert alert-success");
        var el4 = dom.createTextNode("\n      ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("strong");
        var el5 = dom.createTextNode("$");
        dom.appendChild(el4, el5);
        var el5 = dom.createComment("");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode(" for a batch of ");
        dom.appendChild(el3, el4);
        var el4 = dom.createElement("strong");
        var el5 = dom.createComment("");
        dom.appendChild(el4, el5);
        dom.appendChild(el3, el4);
        var el4 = dom.createTextNode("\n    ");
        dom.appendChild(el3, el4);
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n    ");
        dom.appendChild(el2, el3);
        var el3 = dom.createComment("");
        dom.appendChild(el2, el3);
        var el3 = dom.createTextNode("\n  ");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, content = hooks.content;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var element0 = dom.childAt(fragment, [0]);
        var element1 = dom.childAt(element0, [3]);
        var element2 = dom.childAt(element1, [1]);
        var morph0 = dom.createMorphAt(dom.childAt(element0, [1, 1]),0,0);
        var morph1 = dom.createMorphAt(dom.childAt(element2, [1]),1,1);
        var morph2 = dom.createMorphAt(dom.childAt(element2, [3]),0,0);
        var morph3 = dom.createMorphAt(element1,3,3);
        content(env, morph0, context, "model.title");
        content(env, morph1, context, "model.cost");
        content(env, morph2, context, "model.batchSize");
        content(env, morph3, context, "model.description");
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/products', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, inline = hooks.inline;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
          inline(env, morph0, context, "partial", ["products/product-list"], {});
          return fragment;
        }
      };
    }());
    var child1 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, inline = hooks.inline;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
          inline(env, morph0, context, "partial", ["products/edit-product-list"], {});
          return fragment;
        }
      };
    }());
    var child2 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, inline = hooks.inline;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
          inline(env, morph0, context, "outlet", ["product"], {});
          return fragment;
        }
      };
    }());
    var child3 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, inline = hooks.inline;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
          inline(env, morph0, context, "outlet", ["newProduct"], {});
          return fragment;
        }
      };
    }());
    var child4 = (function() {
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createTextNode("    ");
          dom.appendChild(el0, el1);
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          var el1 = dom.createTextNode("\n");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, inline = hooks.inline;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
          inline(env, morph0, context, "outlet", ["editProduct"], {});
          return fragment;
        }
      };
    }());
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","col-md-3");
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","col-md-9");
        var el2 = dom.createTextNode("\n\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, block = hooks.block;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var element0 = dom.childAt(fragment, [0]);
        var element1 = dom.childAt(fragment, [2]);
        var morph0 = dom.createMorphAt(element0,1,1);
        var morph1 = dom.createMorphAt(element0,2,2);
        var morph2 = dom.createMorphAt(element1,1,1);
        var morph3 = dom.createMorphAt(element1,3,3);
        var morph4 = dom.createMorphAt(element1,5,5);
        block(env, morph0, context, "if", [get(env, context, "viewing")], {}, child0, null);
        block(env, morph1, context, "if", [get(env, context, "editing")], {}, child1, null);
        block(env, morph2, context, "if", [get(env, context, "viewing")], {}, child2, null);
        block(env, morph3, context, "if", [get(env, context, "adding")], {}, child3, null);
        block(env, morph4, context, "if", [get(env, context, "editing")], {}, child4, null);
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/products/_edit-product-list', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      var child0 = (function() {
        return {
          isHTMLBars: true,
          revision: "Ember@1.12.0",
          blockParams: 0,
          cachedFragment: null,
          hasRendered: false,
          build: function build(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("      ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          render: function render(context, env, contextualElement) {
            var dom = env.dom;
            var hooks = env.hooks, content = hooks.content;
            dom.detectNamespace(contextualElement);
            var fragment;
            if (env.useFragmentCache && dom.canClone) {
              if (this.cachedFragment === null) {
                fragment = this.build(dom);
                if (this.hasRendered) {
                  this.cachedFragment = fragment;
                } else {
                  this.hasRendered = true;
                }
              }
              if (this.cachedFragment) {
                fragment = dom.cloneNode(this.cachedFragment, true);
              }
            } else {
              fragment = this.build(dom);
            }
            var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
            content(env, morph0, context, "product.title");
            return fragment;
          }
        };
      }());
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, get = hooks.get, block = hooks.block;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(fragment,0,0,contextualElement);
          dom.insertBoundary(fragment, null);
          dom.insertBoundary(fragment, 0);
          block(env, morph0, context, "link-to", ["edit-product", get(env, context, "product.id")], {"class": "list-group-item"}, child0, null);
          return fragment;
        }
      };
    }());
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","panel panel-default");
        var el2 = dom.createTextNode("\n\n    ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("h3");
        dom.setAttribute(el2,"class","product-select-header");
        var el3 = dom.createTextNode("Edit Products");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, block = hooks.block;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var morph0 = dom.createMorphAt(dom.childAt(fragment, [0]),3,3);
        block(env, morph0, context, "each", [get(env, context, "model")], {"keyword": "product"}, child0, null);
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/products/_product-list', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    var child0 = (function() {
      var child0 = (function() {
        return {
          isHTMLBars: true,
          revision: "Ember@1.12.0",
          blockParams: 0,
          cachedFragment: null,
          hasRendered: false,
          build: function build(dom) {
            var el0 = dom.createDocumentFragment();
            var el1 = dom.createTextNode("    ");
            dom.appendChild(el0, el1);
            var el1 = dom.createComment("");
            dom.appendChild(el0, el1);
            var el1 = dom.createTextNode("\n");
            dom.appendChild(el0, el1);
            return el0;
          },
          render: function render(context, env, contextualElement) {
            var dom = env.dom;
            var hooks = env.hooks, content = hooks.content;
            dom.detectNamespace(contextualElement);
            var fragment;
            if (env.useFragmentCache && dom.canClone) {
              if (this.cachedFragment === null) {
                fragment = this.build(dom);
                if (this.hasRendered) {
                  this.cachedFragment = fragment;
                } else {
                  this.hasRendered = true;
                }
              }
              if (this.cachedFragment) {
                fragment = dom.cloneNode(this.cachedFragment, true);
              }
            } else {
              fragment = this.build(dom);
            }
            var morph0 = dom.createMorphAt(fragment,1,1,contextualElement);
            content(env, morph0, context, "product.title");
            return fragment;
          }
        };
      }());
      return {
        isHTMLBars: true,
        revision: "Ember@1.12.0",
        blockParams: 0,
        cachedFragment: null,
        hasRendered: false,
        build: function build(dom) {
          var el0 = dom.createDocumentFragment();
          var el1 = dom.createComment("");
          dom.appendChild(el0, el1);
          return el0;
        },
        render: function render(context, env, contextualElement) {
          var dom = env.dom;
          var hooks = env.hooks, get = hooks.get, block = hooks.block;
          dom.detectNamespace(contextualElement);
          var fragment;
          if (env.useFragmentCache && dom.canClone) {
            if (this.cachedFragment === null) {
              fragment = this.build(dom);
              if (this.hasRendered) {
                this.cachedFragment = fragment;
              } else {
                this.hasRendered = true;
              }
            }
            if (this.cachedFragment) {
              fragment = dom.cloneNode(this.cachedFragment, true);
            }
          } else {
            fragment = this.build(dom);
          }
          var morph0 = dom.createMorphAt(fragment,0,0,contextualElement);
          dom.insertBoundary(fragment, null);
          dom.insertBoundary(fragment, 0);
          block(env, morph0, context, "link-to", ["product", get(env, context, "product.id")], {"class": "list-group-item"}, child0, null);
          return fragment;
        }
      };
    }());
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("div");
        dom.setAttribute(el1,"class","panel panel-default");
        var el2 = dom.createTextNode("\n  ");
        dom.appendChild(el1, el2);
        var el2 = dom.createElement("h3");
        dom.setAttribute(el2,"class","product-select-header");
        var el3 = dom.createTextNode("Product List");
        dom.appendChild(el2, el3);
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("\n");
        dom.appendChild(el1, el2);
        var el2 = dom.createComment("");
        dom.appendChild(el1, el2);
        var el2 = dom.createTextNode("  ");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, get = hooks.get, block = hooks.block;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var morph0 = dom.createMorphAt(dom.childAt(fragment, [0]),3,3);
        block(env, morph0, context, "each", [get(env, context, "model")], {"keyword": "product"}, child0, null);
        return fragment;
      }
    };
  }()));

});
define('bakery/templates/protected', ['exports'], function (exports) {

  'use strict';

  exports['default'] = Ember.HTMLBars.template((function() {
    return {
      isHTMLBars: true,
      revision: "Ember@1.12.0",
      blockParams: 0,
      cachedFragment: null,
      hasRendered: false,
      build: function build(dom) {
        var el0 = dom.createDocumentFragment();
        var el1 = dom.createElement("h3");
        var el2 = dom.createTextNode("Protected Route");
        dom.appendChild(el1, el2);
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\nHello ");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("! Your email is ");
        dom.appendChild(el0, el1);
        var el1 = dom.createComment("");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\n");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("br");
        dom.appendChild(el0, el1);
        var el1 = dom.createElement("br");
        dom.appendChild(el0, el1);
        var el1 = dom.createTextNode("\n\nYou shouldn't see this unless logged in\n");
        dom.appendChild(el0, el1);
        return el0;
      },
      render: function render(context, env, contextualElement) {
        var dom = env.dom;
        var hooks = env.hooks, content = hooks.content;
        dom.detectNamespace(contextualElement);
        var fragment;
        if (env.useFragmentCache && dom.canClone) {
          if (this.cachedFragment === null) {
            fragment = this.build(dom);
            if (this.hasRendered) {
              this.cachedFragment = fragment;
            } else {
              this.hasRendered = true;
            }
          }
          if (this.cachedFragment) {
            fragment = dom.cloneNode(this.cachedFragment, true);
          }
        } else {
          fragment = this.build(dom);
        }
        var morph0 = dom.createMorphAt(fragment,2,2,contextualElement);
        var morph1 = dom.createMorphAt(fragment,4,4,contextualElement);
        content(env, morph0, context, "session.content.userName");
        content(env, morph1, context, "session.content.userEmail");
        return fragment;
      }
    };
  }()));

});
define('bakery/tests/adapters/application.jshint', function () {

  'use strict';

  module('JSHint - adapters');
  test('adapters/application.js should pass jshint', function() { 
    ok(true, 'adapters/application.js should pass jshint.'); 
  });

});
define('bakery/tests/app.jshint', function () {

  'use strict';

  module('JSHint - .');
  test('app.js should pass jshint', function() { 
    ok(true, 'app.js should pass jshint.'); 
  });

});
define('bakery/tests/controllers/admin.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/admin.js should pass jshint', function() { 
    ok(true, 'controllers/admin.js should pass jshint.'); 
  });

});
define('bakery/tests/controllers/contact.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/contact.js should pass jshint', function() { 
    ok(false, 'controllers/contact.js should pass jshint.\ncontrollers/contact.js: line 13, col 36, Expected \'===\' and instead saw \'==\'.\ncontrollers/contact.js: line 28, col 7, Forgotten \'debugger\' statement?\ncontrollers/contact.js: line 28, col 15, Missing semicolon.\ncontrollers/contact.js: line 11, col 11, \'origObject\' is defined but never used.\ncontrollers/contact.js: line 50, col 11, \'latlng\' is defined but never used.\n\n5 errors'); 
  });

});
define('bakery/tests/controllers/contacts-map.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/contacts-map.js should pass jshint', function() { 
    ok(true, 'controllers/contacts-map.js should pass jshint.'); 
  });

});
define('bakery/tests/controllers/contacts.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/contacts.js should pass jshint', function() { 
    ok(false, 'controllers/contacts.js should pass jshint.\ncontrollers/contacts.js: line 7, col 82, Expected an assignment or function call and instead saw an expression.\n\n1 error'); 
  });

});
define('bakery/tests/controllers/edit-product.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/edit-product.js should pass jshint', function() { 
    ok(true, 'controllers/edit-product.js should pass jshint.'); 
  });

});
define('bakery/tests/controllers/login.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/login.js should pass jshint', function() { 
    ok(true, 'controllers/login.js should pass jshint.'); 
  });

});
define('bakery/tests/controllers/new-product.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/new-product.js should pass jshint', function() { 
    ok(true, 'controllers/new-product.js should pass jshint.'); 
  });

});
define('bakery/tests/controllers/products.jshint', function () {

  'use strict';

  module('JSHint - controllers');
  test('controllers/products.js should pass jshint', function() { 
    ok(true, 'controllers/products.js should pass jshint.'); 
  });

});
define('bakery/tests/helpers/resolver', ['exports', 'ember/resolver', 'bakery/config/environment'], function (exports, Resolver, config) {

  'use strict';

  var resolver = Resolver['default'].create();

  resolver.namespace = {
    modulePrefix: config['default'].modulePrefix,
    podModulePrefix: config['default'].podModulePrefix
  };

  exports['default'] = resolver;

});
define('bakery/tests/helpers/resolver.jshint', function () {

  'use strict';

  module('JSHint - helpers');
  test('helpers/resolver.js should pass jshint', function() { 
    ok(true, 'helpers/resolver.js should pass jshint.'); 
  });

});
define('bakery/tests/helpers/start-app', ['exports', 'ember', 'bakery/app', 'bakery/router', 'bakery/config/environment'], function (exports, Ember, Application, Router, config) {

  'use strict';



  exports['default'] = startApp;
  function startApp(attrs) {
    var application;

    var attributes = Ember['default'].merge({}, config['default'].APP);
    attributes = Ember['default'].merge(attributes, attrs); // use defaults, but you can override;

    Ember['default'].run(function () {
      application = Application['default'].create(attributes);
      application.setupForTesting();
      application.injectTestHelpers();
    });

    return application;
  }

});
define('bakery/tests/helpers/start-app.jshint', function () {

  'use strict';

  module('JSHint - helpers');
  test('helpers/start-app.js should pass jshint', function() { 
    ok(true, 'helpers/start-app.js should pass jshint.'); 
  });

});
define('bakery/tests/models/contact.jshint', function () {

  'use strict';

  module('JSHint - models');
  test('models/contact.js should pass jshint', function() { 
    ok(true, 'models/contact.js should pass jshint.'); 
  });

});
define('bakery/tests/models/dispensary.jshint', function () {

  'use strict';

  module('JSHint - models');
  test('models/dispensary.js should pass jshint', function() { 
    ok(true, 'models/dispensary.js should pass jshint.'); 
  });

});
define('bakery/tests/models/product.jshint', function () {

  'use strict';

  module('JSHint - models');
  test('models/product.js should pass jshint', function() { 
    ok(true, 'models/product.js should pass jshint.'); 
  });

});
define('bakery/tests/router.jshint', function () {

  'use strict';

  module('JSHint - .');
  test('router.js should pass jshint', function() { 
    ok(true, 'router.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/admin.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/admin.js should pass jshint', function() { 
    ok(true, 'routes/admin.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/application.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/application.js should pass jshint', function() { 
    ok(true, 'routes/application.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/contact.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/contact.js should pass jshint', function() { 
    ok(true, 'routes/contact.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/contacts-map.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/contacts-map.js should pass jshint', function() { 
    ok(false, 'routes/contacts-map.js should pass jshint.\nroutes/contacts-map.js: line 11, col 10, Missing semicolon.\nroutes/contacts-map.js: line 7, col 9, \'contacts\' is defined but never used.\n\n2 errors'); 
  });

});
define('bakery/tests/routes/contacts.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/contacts.js should pass jshint', function() { 
    ok(true, 'routes/contacts.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/edit-product.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/edit-product.js should pass jshint', function() { 
    ok(true, 'routes/edit-product.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/login.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/login.js should pass jshint', function() { 
    ok(true, 'routes/login.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/new-product.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/new-product.js should pass jshint', function() { 
    ok(true, 'routes/new-product.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/product.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/product.js should pass jshint', function() { 
    ok(true, 'routes/product.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/products.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/products.js should pass jshint', function() { 
    ok(true, 'routes/products.js should pass jshint.'); 
  });

});
define('bakery/tests/routes/protected.jshint', function () {

  'use strict';

  module('JSHint - routes');
  test('routes/protected.js should pass jshint', function() { 
    ok(true, 'routes/protected.js should pass jshint.'); 
  });

});
define('bakery/tests/test-helper', ['bakery/tests/helpers/resolver', 'ember-qunit'], function (resolver, ember_qunit) {

	'use strict';

	ember_qunit.setResolver(resolver['default']);

});
define('bakery/tests/test-helper.jshint', function () {

  'use strict';

  module('JSHint - .');
  test('test-helper.js should pass jshint', function() { 
    ok(true, 'test-helper.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/controllers/admin-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('controller:admin', {});

  // Replace this with your real tests.
  ember_qunit.test('it exists', function (assert) {
    var controller = this.subject();
    assert.ok(controller);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/controllers/admin-test.jshint', function () {

  'use strict';

  module('JSHint - unit/controllers');
  test('unit/controllers/admin-test.js should pass jshint', function() { 
    ok(true, 'unit/controllers/admin-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/controllers/contacts-map-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('controller:contacts-map', {});

  // Replace this with your real tests.
  ember_qunit.test('it exists', function (assert) {
    var controller = this.subject();
    assert.ok(controller);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/controllers/contacts-map-test.jshint', function () {

  'use strict';

  module('JSHint - unit/controllers');
  test('unit/controllers/contacts-map-test.js should pass jshint', function() { 
    ok(true, 'unit/controllers/contacts-map-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/controllers/contacts-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('controller:contacts', {});

  // Replace this with your real tests.
  ember_qunit.test('it exists', function (assert) {
    var controller = this.subject();
    assert.ok(controller);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/controllers/contacts-test.jshint', function () {

  'use strict';

  module('JSHint - unit/controllers');
  test('unit/controllers/contacts-test.js should pass jshint', function() { 
    ok(true, 'unit/controllers/contacts-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/controllers/edit-product-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('controller:edit-product', {});

  // Replace this with your real tests.
  ember_qunit.test('it exists', function (assert) {
    var controller = this.subject();
    assert.ok(controller);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/controllers/edit-product-test.jshint', function () {

  'use strict';

  module('JSHint - unit/controllers');
  test('unit/controllers/edit-product-test.js should pass jshint', function() { 
    ok(true, 'unit/controllers/edit-product-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/controllers/new-product-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('controller:new-product', {});

  // Replace this with your real tests.
  ember_qunit.test('it exists', function (assert) {
    var controller = this.subject();
    assert.ok(controller);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/controllers/new-product-test.jshint', function () {

  'use strict';

  module('JSHint - unit/controllers');
  test('unit/controllers/new-product-test.js should pass jshint', function() { 
    ok(true, 'unit/controllers/new-product-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/controllers/product-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('controller:product', {});

  // Replace this with your real tests.
  ember_qunit.test('it exists', function (assert) {
    var controller = this.subject();
    assert.ok(controller);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/controllers/product-test.jshint', function () {

  'use strict';

  module('JSHint - unit/controllers');
  test('unit/controllers/product-test.js should pass jshint', function() { 
    ok(true, 'unit/controllers/product-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/models/dispensary-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForModel('dispensary', 'Unit | Model | dispensary', {
    // Specify the other units that are required for this test.
    needs: []
  });

  ember_qunit.test('it exists', function (assert) {
    var model = this.subject();
    // var store = this.store();
    assert.ok(!!model);
  });

});
define('bakery/tests/unit/models/dispensary-test.jshint', function () {

  'use strict';

  module('JSHint - unit/models');
  test('unit/models/dispensary-test.js should pass jshint', function() { 
    ok(true, 'unit/models/dispensary-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/models/product-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleForModel('product', 'Unit | Model | product', {
    // Specify the other units that are required for this test.
    needs: []
  });

  ember_qunit.test('it exists', function (assert) {
    var model = this.subject();
    // var store = this.store();
    assert.ok(!!model);
  });

});
define('bakery/tests/unit/models/product-test.jshint', function () {

  'use strict';

  module('JSHint - unit/models');
  test('unit/models/product-test.js should pass jshint', function() { 
    ok(true, 'unit/models/product-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/routes/admin-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('route:admin', 'Unit | Route | admin', {});

  ember_qunit.test('it exists', function (assert) {
    var route = this.subject();
    assert.ok(route);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/routes/admin-test.jshint', function () {

  'use strict';

  module('JSHint - unit/routes');
  test('unit/routes/admin-test.js should pass jshint', function() { 
    ok(true, 'unit/routes/admin-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/routes/contacts-map-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('route:contacts-map', 'Unit | Route | contacts map', {});

  ember_qunit.test('it exists', function (assert) {
    var route = this.subject();
    assert.ok(route);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/routes/contacts-map-test.jshint', function () {

  'use strict';

  module('JSHint - unit/routes');
  test('unit/routes/contacts-map-test.js should pass jshint', function() { 
    ok(true, 'unit/routes/contacts-map-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/routes/edit-product-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('route:edit-product', 'Unit | Route | edit product', {});

  ember_qunit.test('it exists', function (assert) {
    var route = this.subject();
    assert.ok(route);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/routes/edit-product-test.jshint', function () {

  'use strict';

  module('JSHint - unit/routes');
  test('unit/routes/edit-product-test.js should pass jshint', function() { 
    ok(true, 'unit/routes/edit-product-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/routes/new-product-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('route:new-product', 'Unit | Route | new product', {});

  ember_qunit.test('it exists', function (assert) {
    var route = this.subject();
    assert.ok(route);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/routes/new-product-test.jshint', function () {

  'use strict';

  module('JSHint - unit/routes');
  test('unit/routes/new-product-test.js should pass jshint', function() { 
    ok(true, 'unit/routes/new-product-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/routes/product-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('route:product', 'Unit | Route | product', {});

  ember_qunit.test('it exists', function (assert) {
    var route = this.subject();
    assert.ok(route);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/routes/product-test.jshint', function () {

  'use strict';

  module('JSHint - unit/routes');
  test('unit/routes/product-test.js should pass jshint', function() { 
    ok(true, 'unit/routes/product-test.js should pass jshint.'); 
  });

});
define('bakery/tests/unit/routes/products-test', ['ember-qunit'], function (ember_qunit) {

  'use strict';

  ember_qunit.moduleFor('route:products', 'Unit | Route | products', {});

  ember_qunit.test('it exists', function (assert) {
    var route = this.subject();
    assert.ok(route);
  });

  // Specify the other units that are required for this test.
  // needs: ['controller:foo']

});
define('bakery/tests/unit/routes/products-test.jshint', function () {

  'use strict';

  module('JSHint - unit/routes');
  test('unit/routes/products-test.js should pass jshint', function() { 
    ok(true, 'unit/routes/products-test.js should pass jshint.'); 
  });

});
define('bakery/views/google-map/circle', ['exports', 'ember', 'ember-google-map/core/helpers', 'bakery/views/google-map/core'], function (exports, Ember, helpers, GoogleMapCoreView) {

  'use strict';

  var computed = Ember['default'].computed;
  var alias = computed.alias;

  /**
   * @class GoogleMapCircleView
   * @extends GoogleMapCoreView
   */
  exports['default'] = GoogleMapCoreView['default'].extend({
    googleFQCN: 'google.maps.Circle',

    googleProperties: {
      isClickable: { name: 'clickable', optionOnly: true },
      isVisible: { name: 'visible', event: 'visible_changed' },
      isDraggable: { name: 'draggable', event: 'draggable_changed' },
      isEditable: { name: 'editable', event: 'editable_changed' },
      radius: { event: 'radius_changed', cast: helpers['default'].cast.number },
      strokeColor: { optionOnly: true },
      strokeOpacity: { optionOnly: true, cast: helpers['default'].cast.number },
      strokeWeight: { optionOnly: true, cast: helpers['default'].cast.number },
      fillColor: { optionOnly: true },
      fillOpacity: { optionOnly: true, cast: helpers['default'].cast.number },
      zIndex: { cast: helpers['default'].cast.integer, optionOnly: true },
      map: { readOnly: true },
      'lat,lng': {
        name: 'center',
        event: 'center_changed',
        toGoogle: helpers['default']._latLngToGoogle,
        fromGoogle: helpers['default']._latLngFromGoogle
      }
    },

    // aliased from controller so that if they are not defined they use the values from the controller
    radius: alias('controller.radius'),
    zIndex: alias('controller.zIndex'),
    isVisible: alias('controller.isVisible'),
    isDraggable: alias('controller.isDraggable'),
    isClickable: alias('controller.isClickable'),
    isEditable: alias('controller.isEditable'),
    strokeColor: alias('controller.strokeColor'),
    strokeOpacity: alias('controller.strokeOpacity'),
    strokeWeight: alias('controller.strokeWeight'),
    fillColor: alias('controller.fillColor'),
    fillOpacity: alias('controller.fillOpacity'),
    lat: alias('controller.lat'),
    lng: alias('controller.lng')
  });

});
define('bakery/views/google-map/core', ['exports', 'ember', 'ember-google-map/core/helpers', 'ember-google-map/mixins/google-object'], function (exports, Ember, helpers, GoogleObjectMixin) {

  'use strict';

  var computed = Ember['default'].computed;
  var oneWay = computed.oneWay;
  var on = Ember['default'].on;

  /**
   * @class GoogleMapCoreView
   * @extends Ember.View
   * @uses GoogleObjectMixin
   */
  exports['default'] = Ember['default'].View.extend(GoogleObjectMixin['default'], {
    googleMapComponent: oneWay('parentView'),

    googleEventsTarget: oneWay('googleMapComponent.targetObject'),

    map: oneWay('googleMapComponent.map'),

    initGoogleObject: on('didInsertElement', function () {
      // force the creation of the object
      if (helpers['default'].hasGoogleLib() && !this.get('googleObject')) {
        this.createGoogleObject();
      }
    }),

    destroyGoogleObject: on('willDestroyElement', function () {
      var object = this.get('googleObject');
      if (object) {
        // detach from the map
        object.setMap(null);
        this.set('googleObject', null);
      }
    })
  });

});
define('bakery/views/google-map/info-window', ['exports', 'ember', 'ember-google-map/core/helpers', 'bakery/views/google-map/core', 'bakery/views/google-map/marker'], function (exports, Ember, helpers, GoogleMapCoreView, MarkerView) {

  'use strict';

  var observer = Ember['default'].observer;
  var on = Ember['default'].on;
  var scheduleOnce = Ember['default'].run.scheduleOnce;
  var computed = Ember['default'].computed;
  var alias = computed.alias;
  var oneWay = computed.oneWay;
  var any = computed.any;

  /**
   * @class GoogleMapInfoWindowView
   * @extends GoogleMapCoreView
   */
  exports['default'] = GoogleMapCoreView['default'].extend({
    classNames: ['google-info-window'],

    googleFQCN: 'google.maps.InfoWindow',

    // will be either the marker using us, or the component if this is a detached info-window
    templateName: any('controller.templateName', 'parentView.infoWindowTemplateName'),

    googleProperties: {
      zIndex: { event: 'zindex_changed', cast: helpers['default'].cast.integer },
      map: { readOnly: true },
      'lat,lng': {
        name: 'position',
        event: 'position_changed',
        toGoogle: helpers['default']._latLngToGoogle,
        fromGoogle: helpers['default']._latLngFromGoogle
      }
    },

    isMarkerInfoWindow: computed('parentView', function () {
      return this.get('parentView') instanceof MarkerView['default'];
    }),

    googleMapComponent: computed('isMarkerInfoWindow', function () {
      return this.get(this.get('isMarkerInfoWindow') ? 'parentView.parentView' : 'parentView');
    }),

    _coreGoogleEvents: ['closeclick'],

    // aliased from controller so that if they are not defined they use the values from the controller
    zIndex: alias('controller.zIndex'),
    lat: alias('controller.lat'),
    lng: alias('controller.lng'),
    anchor: oneWay('parentView.infoWindowAnchor'),

    visible: computed('parentView.isInfoWindowVisible', 'controller.isVisible', function (key, value) {
      var isMarkerIW = this.get('isMarkerInfoWindow');
      if (arguments.length < 2) {
        if (isMarkerIW) {
          value = this.get('parentView.isInfoWindowVisible');
        } else {
          value = this.getWithDefault('controller.isVisible', true);
          this.set('controller.isVisible', value);
        }
      } else {
        if (isMarkerIW) {
          this.set('parentView.isInfoWindowVisible', value);
        } else {
          this.set('controller.isVisible', value);
        }
      }
      return value;
    }),

    initGoogleObject: on('didInsertElement', function () {
      scheduleOnce('afterRender', this, '_initGoogleInfoWindow');
    }),

    handleInfoWindowVisibility: observer('visible', function () {
      if (this._changingVisible) {
        return;
      }
      var iw = this.get('googleObject');
      if (iw) {
        if (this.get('visible')) {
          iw.open(this.get('map'), this.get('anchor') || undefined);
        } else {
          iw.close();
        }
      }
    }),

    _initGoogleInfoWindow: function _initGoogleInfoWindow() {
      // force the creation of the marker
      if (helpers['default'].hasGoogleLib() && !this.get('googleObject')) {
        this.createGoogleObject({ content: this._backupViewElement() });
        this.handleInfoWindowVisibility();
      }
    },

    destroyGoogleObject: on('willDestroyElement', function () {
      var infoWindow = this.get('googleObject');
      if (infoWindow) {
        this._changingVisible = true;
        infoWindow.close();
        // detach from the map
        infoWindow.setMap(null);
        // free the content node
        this._restoreViewElement();
        this.set('googleObject', null);
        this._changingVisible = false;
      }
    }),

    _backupViewElement: function _backupViewElement() {
      var element = this.get('element');
      if (!this._placeholderElement) {
        this._placeholderElement = document.createElement(element.nodeName);
        element.parentNode.replaceChild(this._placeholderElement, element);
      }
      return element;
    },

    _restoreViewElement: function _restoreViewElement() {
      var element = this.get('element');
      if (this._placeholderElement) {
        this._placeholderElement.parentNode.replaceChild(element, this._placeholderElement);
        this._placeholderElement = null;
      }
      return element;
    },

    _handleCoreEvent: function _handleCoreEvent(name) {
      if (name === 'closeclick') {
        this._changingVisible = true;
        this.set('visible', false);
        this._changingVisible = false;
      }
    }
  });

});
define('bakery/views/google-map/marker', ['exports', 'ember', 'ember-google-map/core/helpers', 'bakery/views/google-map/core'], function (exports, Ember, helpers, GoogleMapCoreView) {

  'use strict';

  var computed = Ember['default'].computed;
  var alias = computed.alias;
  var oneWay = computed.oneWay;
  /**
   * @class GoogleMapMarkerView
   * @extends GoogleMapCoreView
   */
  exports['default'] = GoogleMapCoreView['default'].extend({
    googleFQCN: 'google.maps.Marker',

    googleProperties: {
      isClickable: { name: 'clickable', event: 'clickable_changed' },
      isVisible: { name: 'visible', event: 'visible_changed' },
      isDraggable: { name: 'draggable', event: 'draggable_changed' },
      title: { event: 'title_changed' },
      opacity: { cast: helpers['default'].cast.number },
      icon: { event: 'icon_changed' },
      zIndex: { event: 'zindex_changed', cast: helpers['default'].cast.integer },
      map: { readOnly: true },
      'lat,lng': {
        name: 'position',
        event: 'position_changed',
        toGoogle: helpers['default']._latLngToGoogle,
        fromGoogle: helpers['default']._latLngFromGoogle
      }
    },

    _coreGoogleEvents: ['click'],

    // aliased from controller so that if they are not defined they use the values from the controller
    title: alias('controller.title'),
    opacity: alias('controller.opacity'),
    zIndex: alias('controller.zIndex'),
    isVisible: alias('controller.isVisible'),
    isDraggable: alias('controller.isDraggable'),
    isClickable: alias('controller.isClickable'),
    icon: alias('controller.icon'),
    lat: alias('controller.lat'),
    lng: alias('controller.lng'),

    // get the info window template name from the component or own controller
    infoWindowTemplateName: computed('controller.infoWindowTemplateName', 'parentView.markerInfoWindowTemplateName', function () {
      return this.get('controller.infoWindowTemplateName') || this.get('parentView.markerInfoWindowTemplateName');
    }).readOnly(),

    infoWindowAnchor: oneWay('googleObject'),

    isInfoWindowVisible: alias('controller.isInfoWindowVisible'),

    hasInfoWindow: computed('parentView.markerHasInfoWindow', 'controller.hasInfoWindow', function () {
      var fromCtrl = this.get('controller.hasInfoWindow');
      if (fromCtrl === null || fromCtrl === undefined) {
        return !!this.get('parentView.markerHasInfoWindow');
      }
      return fromCtrl;
    }).readOnly(),

    /**
     * @inheritDoc
     */
    _handleCoreEvent: function _handleCoreEvent(name) {
      if (name === 'click') {
        this.set('isInfoWindowVisible', true);
      }
    }
  });

});
define('bakery/views/google-map/polygon', ['exports', 'ember', 'ember-google-map/core/helpers', 'bakery/views/google-map/polyline'], function (exports, Ember, helpers, GoogleMapPolylineView) {

  'use strict';

  var computed = Ember['default'].computed;
  var alias = computed.alias;

  /**
   * @class GoogleMapPolygonView
   * @extends GoogleMapPolylineView
   */
  exports['default'] = GoogleMapPolylineView['default'].extend({
    googleFQCN: 'google.maps.Polygon',

    googleProperties: computed(function () {
      return Ember['default'].merge(this._super(), {
        fillColor: { optionOnly: true },
        fillOpacity: { optionOnly: true, cast: helpers['default'].cast.number }
      });
    }).readOnly(),

    // aliased from controller so that if they are not defined they use the values from the controller
    fillColor: alias('controller.fillColor'),
    fillOpacity: alias('controller.fillOpacity')
  });

});
define('bakery/views/google-map/polyline', ['exports', 'ember', 'ember-google-map/core/helpers', 'bakery/views/google-map/core'], function (exports, Ember, helpers, GoogleMapCoreView) {

  'use strict';

  var computed = Ember['default'].computed;
  var alias = computed.alias;
  var on = Ember['default'].on;

  /**
   * @class GoogleMapPolylineView
   * @extends GoogleMapCoreView
   */
  exports['default'] = GoogleMapCoreView['default'].extend({
    googleFQCN: 'google.maps.Polyline',

    templateName: 'google-map/polyline',

    googleProperties: computed(function () {
      return {
        isClickable: { name: 'clickable', optionOnly: true },
        isVisible: { name: 'visible', event: 'visible_changed' },
        isDraggable: { name: 'draggable', event: 'draggable_changed' },
        isEditable: { name: 'editable', event: 'editable_changed' },
        isGeodesic: { name: 'geodesic', optionOnly: true },
        icons: { optionOnly: true },
        zIndex: { optionOnly: true, cast: helpers['default'].cast.integer },
        map: { readOnly: true },
        strokeColor: { optionOnly: true },
        strokeWeight: { optionOnly: true, cast: helpers['default'].cast.number },
        strokeOpacity: { optionOnly: true, cast: helpers['default'].cast.number }
      };
    }).readOnly(),

    // aliased from controller so that if they are not defined they use the values from the controller
    strokeColor: alias('controller.strokeColor'),
    strokeWeight: alias('controller.strokeWeight'),
    strokeOpacity: alias('controller.strokeOpacity'),
    zIndex: alias('controller.zIndex'),
    isVisible: alias('controller.isVisible'),
    isDraggable: alias('controller.isDraggable'),
    isClickable: alias('controller.isClickable'),
    isEditable: alias('controller.isEditable'),
    icons: alias('controller.icons'),

    initGoogleObject: on('didInsertElement', function () {
      // force the creation of the polyline
      if (helpers['default'].hasGoogleLib() && !this.get('googleObject')) {
        this.createGoogleObject({ path: this.get('controller._path.googleArray') });
      }
    })
  });

});
/* jshint ignore:start */

/* jshint ignore:end */

/* jshint ignore:start */

define('bakery/config/environment', ['ember'], function(Ember) {
  var prefix = 'bakery';
/* jshint ignore:start */

try {
  var metaName = prefix + '/config/environment';
  var rawConfig = Ember['default'].$('meta[name="' + metaName + '"]').attr('content');
  var config = JSON.parse(unescape(rawConfig));

  return { 'default': config };
}
catch(err) {
  throw new Error('Could not read config from meta tag with name "' + metaName + '".');
}

/* jshint ignore:end */

});

if (runningTests) {
  require("bakery/tests/test-helper");
} else {
  require("bakery/app")["default"].create({"name":"bakery","version":"0.0.0.592228a4"});
}

/* jshint ignore:end */
//# sourceMappingURL=bakery.map