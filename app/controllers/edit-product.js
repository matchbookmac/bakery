import Ember from 'ember';

export default Ember.Controller.extend({
  needs: ['products'],
  authenticator: 'authenticator:torii',
  actions: {
    updateProduct: function() {
      var product = this.get("model");
      product.setProperties({
        title: this.get("model.title"),
        description: this.get("model.description"),
        batchSize: this.get("model.batchSize"),
        cost: this.get("model.cost")
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
    deleteProduct: function () {
      var product = this.get("model");
      product.destroyRecord();
      var productsController = this.get('controllers.products');
      productsController.setProperties({
        editing: true,
        viewing: false,
        adding: false
      });
      this.transitionToRoute("edit");
    }
  }
});
