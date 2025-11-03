const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            unique: true,
        },
        pendingTasks: { 
            type: [String], default: [] // The _id fields of the pending tasks that this user has
        }, 
        dateCreated: { 
            type: Date, default: Date.now // set automatically by server
        },  

    },
    {
        versionKey: false
    }
);

UserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model('User', UserSchema);
