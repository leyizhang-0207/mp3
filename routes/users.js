const router = require("express").Router();
const mongoose = require("mongoose");
const User = require("../models/user");
const Task = require("../models/task");
const { format } = require("morgan");

function parseJSON(query, key, rawValue) {
    if (query[key] == null) {
        return rawValue;
    }

    try {
        return JSON.parse(query[key]);
    } catch {
        const error = new Error(`Invalid JSON for '${key}'`);
        error.name = "ValidationError";
        throw error;
    }
}

function formatQuery(req, defaultLimit = 0) {
    const query = req.query;

    const where = parseJSON(query, "where", {});
    const select = parseJSON(query, "select", parseJSON(query, "filter", null));
    const sort = parseJSON(query, "sort", null);
    const skip = query.skip ? Math.max(parseInt(query.skip, 10), 0) : 0;
    const limit = query.limit ? Math.max(parseInt(query.limit, 10), 0) : defaultLimit;
    const count = String(query.count).toLowerCase() === "true";

    return { where, select, sort, skip, limit, count };
}

// GET
router.get("/", async (req, res, next) => {
    try {
        const { where, select, sort, skip, limit, count } = formatQuery(req, 0);
        if (count) {
            const c = await User.countDocuments(where);
            return res.json({ message: "Count only", data: { count: c } });
        }

        let query = User.find(where);
        if (select) {
            query = query.select(select);
        }
        if (sort) {
            query = query.sort(sort);
        }
        if (skip) {
            query = query.skip(skip);
        }
        if (limit && limit > 0) {
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
        const { name, email, pendingTasks = [] } = req.body;
        const user = await User.create({ name, email, pendingTasks });

        if (pendingTasks.length) {
            const tasks = await Task.find({
                _id: { $in: pendingTasks },
                completed: false,
            });
            await Promise.all(
                tasks.map(async (t) => {
                    t.assignedUser = user._id.toString();
                    t.assignedUserName = user.name;
                    await t.save();
                })
            );
        }

        res.status(201).json({ message: "Created", data: user });
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

        let query = User.findById(req.params.id);

        const { select } = formatQuery(req, 0);
        if (select) {
            query = query.select(select);
        }

        const user = await query.exec();
        if (!user) {
            return res.status(404).json({ message: "User not found", data: null });
        }

        res.json({ message: "OK", data: user });
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

        const { name, email, pendingTasks = [] } = req.body;
        if (!name || !email) {
            return res.status(400).json({
                message: "Name and email are required for user update",
                data: null,
            });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found.", data: null });
        }

        const old = new Set(user.pendingTasks.map(String));
        const newTasks = new Set([].concat(pendingTasks).map(String)); // handle encoded arrays

        user.name = name;
        user.email = email;
        user.pendingTasks = [...newTasks];
        await user.save();

        const toAdd = [...newTasks].filter((id) => !old.has(id));
        const toRemove = [...old].filter((id) => !newTasks.has(id));

        if (toAdd.length) {
            const tasks = await Task.find({ _id: { $in: toAdd }, completed: false });
            await Promise.all(
                tasks.map(async (t) => {
                    t.assignedUser = user._id.toString();
                    t.assignedUserName = user.name;
                    await t.save();
                })
            );
        }

        if (toRemove.length) {
            const tasks = await Task.find({
                _id: { $in: toRemove },
                assignedUser: user._id.toString(),
                completed: false,
            });
            await Promise.all(
                tasks.map(async (t) => {
                    t.assignedUser = "";
                    t.assignedUserName = "unassigned";
                    await t.save();
                })
            );
        }

        res.json({ message: "Updated", data: user });
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

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found", data: null });
        }

        if (user.pendingTasks.length) {
            await Task.updateMany(
                {
                    _id: { $in: user.pendingTasks },
                    assignedUser: user._id.toString(),
                    completed: false,
                },
                { $set: { assignedUser: "", assignedUserName: "unassigned" } }
            );
        }

        await user.deleteOne();
        res.json({ message: "Deleted", data: { _id: user._id } });
    } catch (e) {
        next(e);
    }
});

module.exports = router;