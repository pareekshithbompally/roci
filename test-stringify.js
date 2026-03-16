const obj = {
  providers: [
    { provider: 'openai', active: true, models: [], settings: [{ key: 'api-key', val: '123' }] }
  ]
};

const keys = Object.keys(obj).sort();
console.log("Keys:", keys);
const result = JSON.stringify(obj, keys);
console.log("Stringified:", result);
