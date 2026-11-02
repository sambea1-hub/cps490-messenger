const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 32
  },
  passwordHash: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.methods.toSafeObject = function () {
  return {
    id: this._id.toString(),
    username: this.username,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('User', userSchema);
