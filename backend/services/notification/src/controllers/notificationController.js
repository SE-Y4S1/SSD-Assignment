const emailService = require('../services/emailService');
const smsService = require('../services/smsService');
const Notification = require('../models/notificationModel');

const sendEmail = (to, subject, text) => emailService.sendEmail(to, subject, text);
const sendSMS = (to, message) => smsService.sendSMS(to, message);

const createNotification = async (req, res) => {
// Failures are logged in full and answered generically (V-A14).
const { respondWithError } = require('../utils/clientError');
  try {
    const { recipient, type, message } = req.body;
    const notification = new Notification({ recipient, type, message });
    await notification.save();
    res.status(201).json(notification);
  } catch (error) {
    return respondWithError(res, error, 'notification.createNotification');
  }
};

const getNotifications = async (_req, res) => {
  try {
    const notifications = await Notification.find();
    res.json(notifications);
  } catch (error) {
    return respondWithError(res, error, 'notification.getNotifications');
  }
};

const updateNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification);
  } catch (error) {
    return respondWithError(res, error, 'notification.updateNotification');
  }
};

const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    return respondWithError(res, error, 'notification.deleteNotification');
  }
};

module.exports = {
  sendEmail,
  sendSMS,
  createNotification,
  getNotifications,
  updateNotification,
  deleteNotification,
};
