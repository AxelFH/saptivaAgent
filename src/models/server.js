const express = require('express');
const cors = require('cors');
const http = require('http');

class Server {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app); // Create the server


    // Define all paths in application
    this.paths = {
      server: '/',
      webhooks: '/webhook',
      dashboardApi: '/api',
    };

    this.middleware();
    this.routes();
  }

  routes() {
    this.app.use(this.paths.server, require('../routes/server.routes'));
    this.app.use(this.paths.webhooks, require('../routes/webhooks.routes'));

    
    this.app.use(this.paths.dashboardApi, require('../routes/dashboard.routes'));
  }

  middleware() {
    // CORS
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  listen() {
    const port = process.env.PORT || 3000;
    this.server.listen(port, () => {
      console.log('Server started at port ' + port);
    });
  }
}

module.exports = Server; // Export the Server class, not an instance
