import Ember from 'ember';






export default Ember.ArrayController.extend({
  needs: ['products', 'contact'],

  selectedProductsList: null,
  isChecked: false,
  actions: {
    contactProducts: function() {
      var selectedProducts = this.get('selectedProductsList');
    },

    checkBox: function(params) {
      var box = this.store.find('product', params.id);
      if (box.selected) {
        box.setProperties({
          selected: false,
        });
      } else {
        box.setProperties({
          selected: true,
        });
      }
    },
    checkboxParseTest: function() {
      var checkedBoxes = [];
      var origObject = this;
      this.forEach(function(item) {
        if (item.get('selected') == true) {
          checkedBoxes.push(item.get('title'));
        }
      });
    }
  }
});
