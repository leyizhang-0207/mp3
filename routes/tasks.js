const router = require("express").Router();
const mongoose = require("mongoose");
const Task = require("../models/task");
const User = require("../models/user");

function parseJSON(query, key, rawValue) {
    if (query[key] == null) {
        return rawValue;
    }

    try {
        return JSON.parse(query[key]);
    } catch {
        const e = new Error(`Invalid JSON for '${key}'`);
        e.name = "ValidationError";
        throw e;
    }
}

function formatQuery(req, defaultLimit = 100) {
    const query = req.query;

    const where = parseJSON(query, "where", {});
    const select = parseJSON(query, "select", parseJSON(query, "filter", null));
    const sort = parseJSON(query, "sort", null);
    const skip = query.skip ? Math.max(parseInt(query.skip, 10), 0) : 0;
    const limit = query.limit ? Math.max(parseInt(query.limit, 10), 0) : defaultLimit;
    const count = String(query.count).toLowerCase() === "true";

    return { where, select, sort, skip, limit, count };
}

async function addToUserPending(userId, taskId) {
    if (!userId) {
        return;
    }

    await User.updateOne(
        { _id: userId, pendingTasks: { $ne: taskId } },
        { $push: { pendingTasks: taskId } }
    );
}

async function removeFromUserPending(userId, taskId) {
    if (!userId) {
        return;
    }

    await User.updateOne(
        { _id: userId },
        { $pull: { pendingTasks: taskId } }
    );
}

router.get("/", async (req, res, next) => {
    try {
        const { where, select, sort, skip, limit, count } = formatQuery(req, 100);
        if (count) {
            const c = await Task.countDocuments(where);
            return res.json({ message: "Count only", data: { count: c } });
        }

        let query = Task.find(where);
        if (select) {
            query = query.select(select);
        }
        if (sort) {
            query = query.sort(sort);
        }
        if (skip) {
            query = query.skip(skip);
        }
        if (limit) {
            query = query.limit(limit);
        }

        res.json({ message: "OK", data: await query.exec() });
    } catch (e) {
        next(e);
    }
});

// POST
router.post("/", async (req, res, next) => {
    try {
        let {
            name,
            description = "",
            deadline,
            completed = "false",
            assignedUser = "",
            assignedUserName = "unassigned",
        } = req.body;

        if (!name || !deadline) {
            return res
                .status(400)
                .json({ message: "Must include name and deadline", data: null });
        }

        completed = String(completed).toLowerCase() === "true";
        const assignedUserId = String(assignedUser || "").trim();

        if (assignedUserId) {
            if (!mongoose.isValidObjectId(assignedUserId)) {
                return res
                    .status(400)
                    .json({ message: "Invalid assignedUser id", data: null });
            }

            const user = await User.findById(assignedUserId);
            if (!user) {
                return res
                    .status(400)
                    .json({ message: "assignedUser does not exist", data: null });
            }

            assignedUser = assignedUserId;
            assignedUserName = user.name;
        } else {
            assignedUser = "";
            assignedUserName = "unassigned";
        }

        const task = await Task.create({
            name,
            description,
            deadline: new Date(Number(deadline) || deadline), //timestamps
            completed,
            assignedUser,
            assignedUserName,
        });

        if (!task.completed && task.assignedUser) {
            await addToUserPending(task.assignedUser, task._id.toString());
        }

        res.status(201).json({ message: "Created", data: task });
    } catch (e) {
        next(e);
    }
});

// GET
router.get("/:id", async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res
                .status(400)
                .json({ message: "Invalid id format", data: null });
        }

        let q = Task.findById(req.params.id);

        const { select } = formatQuery(req, 0);
        if (select) {
            q = q.select(select);
        }

        const task = await q.exec();
        if (!task) {
            return res.status(404).json({ message: "Task not found", data: null });
        }

        res.json({ message: "OK", data: task });
    } catch (e) {
        next(e);
    }
});

// PUT
router.put("/:id", async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res
                .status(400)
                .json({ message: "Invalid id format", data: null });
        }

        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: "Task not found", data: null });
        }

        let {
            name,
            description = "",
            deadline,
            completed = "false",
            assignedUser = "",
            assignedUserName = "unassigned",
        } = req.body;

        if (!name || !deadline) {
            return res
                .status(400)
                .json({ message: "must include name and deadline", data: null });
        }

        const prev = { completed: task.completed, assignedUser: task.assignedUser };

        completed = String(completed).toLowerCase() === "true";
        const assignedUserId = String(assignedUser || "").trim();

        if (assignedUserId) {
            if (!mongoose.isValidObjectId(assignedUserId)) {
                return res
                    .status(400)
                    .json({ message: "invalid assignedUser id", data: null });
            }

            const user = await User.findById(assignedUserId);
            if (!user) {
                return res
                    .status(400)
                    .json({ message: "assignedUser does not exist", data: null });
            }

            assignedUser = assignedUserId;
            assignedUserName = user.name;
        } else {
            assignedUser = "";
            assignedUserName = "unassigned";
        }

        task.name = name;
        task.description = description;
        task.deadline = new Date(Number(deadline) || deadline);
        task.completed = completed;
        task.assignedUser = assignedUser;
        task.assignedUserName = assignedUserName;
        await task.save();

        const now = { completed: task.completed, assignedUser: task.assignedUser };
        const taskId = task._id.toString();

        if (prev.assignedUser && prev.assignedUser !== now.assignedUser) {
            await removeFromUserPending(prev.assignedUser, taskId);
        }
        if (now.assignedUser && prev.assignedUser !== now.assignedUser && !now.completed) {
            await addToUserPending(now.assignedUser, taskId);
        }
        if (!prev.completed && now.completed && now.assignedUser) {
            await removeFromUserPending(now.assignedUser, taskId);
        }
        if (prev.completed && !now.completed && now.assignedUser) {
            await addToUserPending(now.assignedUser, taskId);
        }

        res.json({ message: "Updated", data: task });
    } catch (e) {
        next(e);
    }
});

// DELETE
router.delete("/:id", async (req, res, next) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res
                .status(400)
                .json({ message: "Invalid id format", data: null });
        }

        const task = await Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ message: "Task not found", data: null });
        }

        const taskId = task._id.toString();
        const userId = task.assignedUser;

        await task.deleteOne();
        if (userId) await removeFromUserPending(userId, taskId);

        res.json({ message: "Deleted", data: { _id: taskId } });
    } catch (error) {
        next(error);
    }
});

module.exports = router;