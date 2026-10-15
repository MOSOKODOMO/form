const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FI = require('../dist/catalogue.js');
const products = require('../dist/data/products.json');

function render(product) {
  const element = () => {
    const classes = new Set();
    return {children:[], attrs:{}, events:{}, classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
      append(...items){this.children.push(...items);}, setAttribute(k,v){this.attrs[k]=v;}, addEventListener(k,fn){this.events[k]=fn;}};
  };
  const images=[];
  const window={FICatalogue:FI,FIProductImage:(p)=>{const image=element();image.src=p.photo_url;images.push(image);return image;}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/product-card.js'),'utf8'),{window,document:{createElement:element,createTextNode:text=>text}});
  const card=window.FIProductCard.card(product);
  return {media:card.children[0].children[0],images};
}

test('cabinet previews retain the product link and become available only once loaded',()=>{
  for(const product of products.filter(p=>p.gallery_images?.length)) {
    const {media,images}=render(product);
    assert.equal(media.href,FI.productUrl(product));
    assert.equal(images.length,2);
    assert.equal(images[0].src,product.photo_url);
    assert.equal(images[1].src,product.gallery_images[0].src);
    assert.equal(media.classList.contains('product-card-media--preview-ready'),false);
    images[1].events.load();
    assert.equal(media.classList.contains('product-card-media--preview-ready'),true);
    images[1].events.error();
    images[1].events.load(); // A fallback image loading must not hide the original photo.
    assert.equal(media.classList.contains('product-card-media--preview-ready'),false);
  }
});

test('products without a second image keep a single linked photo',()=>{
  const product=products.find(p=>!p.gallery_images);
  const {media,images}=render(product);
  assert.equal(images.length,1);
  assert.equal(media.href,FI.productUrl(product));
  assert.equal(media.classList.contains('product-card-media--preview-ready'),false);
});
