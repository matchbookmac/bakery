import Ember from 'ember';


export default Ember.ArrayController.extend({
  needs: ['products', 'contacts'],
  selectedProductsList: null,
  isChecked: false,
  actions: {
    contactProducts: function() {
      var selectedProducts = this.get('selectedProductsList');
    },
    checkboxParseTest: function() {
      // moving to attempt to parse dom for inputs, gather them, then iterate through them to check for values
      var checkedBoxes;
      var checkboxes = document.getElementsByClass('checkbox');
      checkboxes.forEach(function(box){
        if (box.checked) {
          checkedBoxes.push(box);
        }
      });
      // the above is problematic and relatively untested, will continue on Thurs at 0900


      // all comments below are failed experiments
      // var allValues = this.get('model');
      // var submittedValues;
      // allValues.forEach(function(item){
      //   if (item.isChecked)
      // })
      //
      // for (var i = 0; i <= allValues.length; i++) {
      //   if (allValues[i].isChecked){
      //     submittedValues.push(allValues[i]);
      //   }
      // }
      // debugger;
    }
  }
});
