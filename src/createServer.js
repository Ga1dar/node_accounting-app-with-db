/* eslint-disable no-undef */
'use strict';

const express = require('express');
const { models } = require('./models/models.js');
const { Op } = require('sequelize');

function createServer() {
  // Use express to create a server
  // Add a routes to the server
  // Return the server (express app)
  const app = express();
  const { User, Expense } = models;

  app.use(express.json());
  // #region helpers and validate

  function parseId(value) {
    const id = Number(value);

    if (!Number.isInteger(id) || id <= 0) {
      return null;
    }

    return id;
  }

  function isValidDateTime(value) {
    if (typeof value !== 'string') {
      return false;
    }

    const time = Date.parse(value);

    return Number.isFinite(time);
  }

  function sendBadRequest(res, message) {
    res.status(400).json({ message });
  }

  function sendNotFound(res, message) {
    res.status(404).json({ message });
  }

  async function findUserById(id) {
    // eslint-disable-next-line no-return-await
    return await User.findByPk(id);
  }

  async function findExpenseById(id) {
    // eslint-disable-next-line no-return-await
    return await Expense.findByPk(id);
  }
  // #endregion

  // #region users
  app.get('/users', async (req, res) => {
    const users = await User.findAll();

    res.json(users);
  });

  app.post('/users', async (req, res) => {
    const body = req.body;

    if (!body || typeof body !== 'object') {
      return sendBadRequest(res, 'Request body is required');
    }

    const { name } = body;

    if (typeof name !== 'string' || name.trim() === '') {
      return sendBadRequest(res, 'Field "name" is required');
    }

    try {
      const newUser = await User.create({
        name: name.trim(),
      });

      res.status(201).json(newUser);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log(error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  });

  app.get('/users/:id', async (req, res) => {
    const id = parseId(req.params.id);

    if (id === null) {
      return sendBadRequest(res, 'Invalid id');
    }

    const user = await findUserById(id);

    if (!user) {
      return sendNotFound(res, 'User not found');
    }

    res.json(user);
  });

  app.patch('/users/:id', async (req, res) => {
    const id = parseId(req.params.id);

    if (id === null) {
      return sendBadRequest(res, 'Invalid id');
    }

    const user = await findUserById(id);

    if (!user) {
      return sendNotFound(res, 'User not found');
    }

    const body = req.body;

    if (!body || typeof body !== 'object') {
      return sendBadRequest(res, 'Request body is required');
    }

    if (typeof body.name !== 'string' || body.name.trim() === '') {
      return sendBadRequest(res, 'Field "name" is required');
    }

    user.name = body.name.trim();

    await user.save();

    res.json(user);
  });

  app.delete('/users/:id', async (req, res) => {
    const id = parseId(req.params.id);

    if (id === null) {
      return sendBadRequest(res, 'Invalid id');
    }

    const user = await findUserById(id);

    if (!user) {
      return sendNotFound(res, 'User not found');
    }

    await user.destroy();

    res.status(204).send();
  });
  // #endregion

  // #region expenses
  app.get('/expenses', async (req, res) => {
    const { userId, categories, from, to } = req.query;

    const where = {};

    if (userId !== undefined) {
      const parseUserId = parseId(userId);

      if (parseUserId === null) {
        return sendBadRequest(res, 'Invalid userId');
      }

      where.userId = parseUserId;
    }

    if (categories !== undefined) {
      let categoriesList = categories;

      if (typeof categoriesList === 'string') {
        /* eslint-disable prettier/prettier */
        categoriesList = categoriesList.includes(',')
          ? categoriesList
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          : [categoriesList];
        /* eslint-enable prettier/prettier */
      }

      where.category = {
        [Op.in]: categoriesList,
      };
    }

    if (from !== undefined) {
      if (!isValidDateTime(from)) {
        return sendBadRequest(res, 'Invalid "from" date-time');
      }

      where.spentAt = {
        ...(where.spentAt || {}),
        [Op.gte]: new Date(from),
      };
    }

    if (to !== undefined) {
      if (!isValidDateTime(to)) {
        return sendBadRequest(res, 'Invalid "to" date-time');
      }

      where.spentAt = {
        ...(where.spentAt || {}),
        [Op.lte]: new Date(to),
      };
    }

    const expenses = await Expense.findAll({ where });

    res.json(expenses);
  });

  app.post('/expenses', async (req, res) => {
    const body = req.body;

    if (!body || typeof body !== 'object') {
      return sendBadRequest(res, 'Request body is required');
    }

    const { userId, spentAt, title, amount, category, note } = body;

    const parsedUserId = parseId(userId);

    if (parsedUserId === null) {
      return sendBadRequest(
        res,
        'Field "userId" is required and must be integer',
      );
    }

    const user = await findUserById(parsedUserId);

    if (!user) {
      return sendBadRequest(res, 'User not found');
    }

    if (typeof title !== 'string' || title.trim() === '') {
      return sendBadRequest(res, 'Field "title" is required');
    }

    const parsedAmount = Number(amount);

    if (!Number.isInteger(parsedAmount)) {
      return sendBadRequest(res, 'Field "amount" must be integer');
    }

    const DEFAULT_CATEGORY = 'Other';

    let categoryValue = DEFAULT_CATEGORY;

    if (category !== undefined && category !== null) {
      if (typeof category !== 'string' || category.trim() === '') {
        return sendBadRequest(res, 'Field "category" must be non-empty string');
      }

      categoryValue = category.trim();
    }

    if (note !== undefined && note !== null && typeof note !== 'string') {
      return sendBadRequest(res, 'Field "note" must be string');
    }

    let spentAtValue;

    if (spentAt === undefined || spentAt === null) {
      // Use current date if not provided
      spentAtValue = new Date();
    } else if (typeof spentAt === 'string') {
      if (!isValidDateTime(spentAt)) {
        return sendBadRequest(
          res,
          'Field "spentAt" must be a valid date-time string',
        );
      }
      spentAtValue = new Date(spentAt);
    } else if (spentAt instanceof Date) {
      if (!Number.isFinite(spentAt.getTime())) {
        return sendBadRequest(
          res,
          'Field "spentAt" must be a valid date-time string',
        );
      }
      spentAtValue = spentAt;
    } else {
      return sendBadRequest(
        res,
        'Field "spentAt" must be a valid date-time string',
      );
    }

    const newExpense = await Expense.create({
      userId: parsedUserId,
      spentAt: spentAtValue,
      title: title.trim(),
      amount: parsedAmount,
      category: categoryValue,
      note: note !== undefined && note !== null ? note : null,
    });

    res.status(201).json(newExpense);
  });

  app.get('/expenses/:id', async (req, res) => {
    const id = parseId(req.params.id);

    if (id === null) {
      return sendBadRequest(res, 'Invalid id');
    }

    const expense = await findExpenseById(id);

    if (!expense) {
      return sendNotFound(res, 'Expense not found');
    }

    res.json(expense);
  });

  app.patch('/expenses/:id', async (req, res) => {
    const id = parseId(req.params.id);

    if (id === null) {
      return sendBadRequest(res, 'Invalid id');
    }

    const expense = await findExpenseById(id);

    if (!expense) {
      return sendNotFound(res, 'Expense not found');
    }

    const body = req.body;

    if (!body || typeof body !== 'object') {
      return sendBadRequest(res, 'Request body is required');
    }

    if (Object.prototype.hasOwnProperty.call(body, 'spentAt')) {
      if (!isValidDateTime(body.spentAt)) {
        return sendBadRequest(res, 'Field "spentAt" must be valid date-time');
      }

      expense.spentAt = body.spentAt;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
      if (typeof body.title !== 'string' || body.title.trim() === '') {
        return sendBadRequest(res, 'Field "title" must be non-empty string');
      }

      expense.title = body.title.trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'amount')) {
      const parsedAmount = Number(body.amount);

      if (!Number.isInteger(parsedAmount)) {
        return sendBadRequest(res, 'Field "amount" must be integer');
      }

      expense.amount = parsedAmount;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
      if (typeof body.category !== 'string' || body.category.trim() === '') {
        return sendBadRequest(res, 'Field "category" must be non-empty string');
      }

      expense.category = body.category.trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'note')) {
      if (body.note === null) {
        expense.note = null;
      } else if (typeof body.note !== 'string') {
        return sendBadRequest(res, 'Field "note" must be string or null');
      } else {
        expense.note = body.note;
      }
    }

    await expense.save();

    res.json(expense);
  });

  app.delete('/expenses/:id', async (req, res) => {
    const id = parseId(req.params.id);

    if (id === null) {
      return sendBadRequest(res, 'Invalid id');
    }

    const expense = await findExpenseById(id);

    if (!expense) {
      return sendNotFound(res, 'Expense not found');
    }

    await expense.destroy();

    res.status(204).send();
  });
  // #endregion

  return app;
}

module.exports = {
  createServer,
};
