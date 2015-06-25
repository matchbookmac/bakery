import Ember from 'ember';

export default Ember.Route.extend({
  model: function() {
    return Ember.A([
      {title:  "bloop", lat: 45.521856, lng: -122.674290, body: "Bloop bloop!"}
    ]);
  }
});
