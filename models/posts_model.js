const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const postSchema = new Schema({
  title: { type: String, required: true }, //required=true - means that this paramter must have a value
  content: String,
  sender: { type: String, required: true },
});

const postModel = mongoose.model("Posts", postSchema); //all the posts will be inside the "Posts" model

module.exports = postModel;
