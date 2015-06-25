import DS from 'ember-data';

export default DS.Model.extend({
  title: DS.attr("string"),
  description: DS.attr("string"),
  batchSize: DS.attr("number"),
  cost: DS.attr("number"),
  contact: DS.belongsTo("contact", {async: true}),
  selected: DS.attr('boolean')
});
