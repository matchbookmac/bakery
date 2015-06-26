import DS from 'ember-data';

export default DS.Model.extend({
  businessName:  DS.attr('string'),
  emailAddress:  DS.attr('string'),
  streetAddress:  DS.attr('string'),
  city:  DS.attr('string'),
  state:  DS.attr('string'),
  zip:  DS.attr('string'),
  phone:  DS.attr('string'),
  productInterest: DS.hasMany('product', {async: true}),
  lat: DS.attr('string'),
  lng: DS.attr('string')
});
