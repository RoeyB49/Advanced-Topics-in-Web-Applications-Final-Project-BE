require("dotenv").config({ path: ".env.dev" });
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const connectDB = require("./database/db");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const postsRoutes = require("./routes/posts_routes");
const commentRoutes = require("./routes/comments_routes");

app.use("/post", postsRoutes); 
app.use("/comment", commentRoutes);

app.get("/about", (req, res) => {
  res.send("about response");
});

connectDB();

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
