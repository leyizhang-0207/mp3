// Get the packages we need
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser');

// Read .env file
require('dotenv').config();

// Create our Express application
var app = express();

// Use environment defined port or 3000
var port = process.env.PORT || 3000;

// Connect to a MongoDB --> Uncomment this once you have a connection string!!
mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGODB_URI);

// Allow CORS so that backend and frontend could be put on different servers
var allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};
app.use(allowCrossDomain);

// Use the body-parser package in our application
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

// Use routes as a module (see index.js)
require('./routes')(app, router);

// JSON error handler
app.use((err, req, res, next) => {
  if (err && err.code === 11000) {
    return res.status(400).json({ message: 'this email has been registered， please use another one', data: {} });
  }

  if (err?.name === 'ValidationError') {
    const msg = Object.values(err.errors).map(e => e.message).join(' ');
    return res.status(400).json({ message: msg, data: {} });
  }

  if (err?.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid id format', data: {} });
  }

  console.error('ERROR！！！！！！！！！！', err);

  res.status(500).json({ message: 'Server error', data: {} });
});

// Start the server
app.listen(port);
console.log('Server running on port ' + port);
