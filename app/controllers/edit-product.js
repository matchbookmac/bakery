import Ember from 'ember';

export default Ember.Controller.extend({
  needs: ['products'],
  actions: {
    updateProduct: function() {
      var product = this.get("model")
      product.setProperties({
        title: this.get("model.title"),
        description: this.get("model.description"),
        batchSize: this.get("model.batchSize"),
        cost: this.get("model.cost")
      });
      product.save();
      var productsController = this.get('controllers.products')
      productsController.setProperties({
        viewing: true,
        editing: false,
        adding: false
      });
      this.transitionToRoute('product', product.id);
    }
  }
});
