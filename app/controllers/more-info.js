import Ember from 'ember';

needs: ['products', 'contacts']

export default Ember.ArrayController.extend({
  selectedProductsList: null,
  actions: {
    contactProducts: function() {
      var selectedProducts = this.get('selectedProductsList');
    }
  }
});
