const express = require('express');
const app = express();

app.get('/actuator/health', (req, res) => res.json({status:"UP"}));
app.get('/', (req, res) => res.send("BlueGreen Running"));

// Listen on ALL interfaces (REQUIRED)
app.listen(8080, '0.0.0.0');
