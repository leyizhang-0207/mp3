const { Schema, model } = require('mongoose');

const TaskSchema = new Schema(
    {
        name: { 
            type: String, required: [true, 'Task name is required.'] 
        },
        description: { 
            type: String, default: ''
        },
        deadline: { 
            type: Date, required: [true, 'Deadline is required.'] 
        },
        completed: { 
            type: Boolean, default: false 
        },
        assignedUser: { 
            type: String, default: '' //The _id field of the user this task is assigned to - default ""
        }, 
        assignedUserName: { 
            type: String, default: 'unassigned' //The name field of the user this task is assigned to - default "unassigned"
        }, 
        dateCreated: { 
            type: Date, default: Date.now  //set automatically by server to present datev
        }
    }, 
    {
        versionKey: false 
    }
);

module.exports = model('Task', TaskSchema);
