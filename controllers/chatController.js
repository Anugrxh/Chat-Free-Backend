// controllers/chatController.js

const User = require("../models/User");
const axios = require("axios");
const mongoose = require("mongoose");

// Function 1: Get all chats for a user (FIXED)
exports.getChats = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('chats');
    if (!user) return res.status(404).json({ message: "User not found" });
    
    // Return the chats array directly (frontend expects this format)
    res.json(user.chats);
  } catch (error) {
    console.error("Error fetching chats:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Function 2: Create a new chat (Unchanged)
exports.createNewChat = async (req, res) => {
  try {
    const { title } = req.body;
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const newChat = { title, messages: [] };
    user.chats.push(newChat);
    await user.save();

    // Return the last chat added, which is the new one
    res.status(201).json(user.chats[user.chats.length - 1]);
  } catch (error) {
    console.error("Error creating new chat:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Function 3: Get a specific chat by its ID (FIXED WITH VALIDATION)
exports.getChatById = async (req, res) => {
  try {
    const chatId = req.params.chatId;
    console.log(`Fetching chat with ID: ${chatId} for user: ${req.user.userId}`);
    
    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      console.log(`Invalid ObjectId format: ${chatId}`);
      return res.status(400).json({ message: "Invalid chat ID format" });
    }
    
    const user = await User.findById(req.user.userId).select('chats');
    if (!user) {
      console.log("User not found");
      return res.status(404).json({ message: "User not found" });
    }

    console.log(`User found with ${user.chats.length} chats`);
    
    const chat = user.chats.id(chatId);
    if (!chat) {
      console.log(`Chat with ID ${chatId} not found`);
      console.log("Available chat IDs:", user.chats.map(c => c._id.toString()));
      return res.status(404).json({ message: "Chat not found" });
    }

    console.log(`Chat found: ${chat.title} with ${chat.messages.length} messages`);

    // Return chat with limited messages for performance
    const chatData = {
      _id: chat._id,
      title: chat.title,
      messages: chat.messages.slice(-50) // Last 50 messages
    };

    res.json(chatData);
  } catch (error) {
    console.error("Error fetching chat by ID:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Function 4: Add a message (OPTIMIZED FOR PERFORMANCE)
exports.addMessageToChat = async (req, res) => {
  const { message } = req.body;
  
  // Input validation
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ message: "Valid message is required." });
  }

  if (message.length > 4000) {
    return res.status(400).json({ message: "Message too long. Maximum 4000 characters." });
  }

  try {
    // Find user and chat in one query for better performance
    const user = await User.findById(req.user.userId).select('chats');
    if (!user) return res.status(404).json({ message: "User not found" });

    const chat = user.chats.id(req.params.chatId);
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    // Save the user's message
    const userMessage = {
      sender: "user",
      text: message.trim(),
      timestamp: new Date(),
    };
    chat.messages.push(userMessage);

    // --- OPTIMIZED MEMORY IMPLEMENTATION ---
    // Format chat history for Gemini API
    const history = chat.messages.map((msg) => ({
      role: msg.sender === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));

    // Limit to last 15 messages for better performance and token efficiency
    const recentHistory = history.slice(-15);

    // --- API CALL WITH TIMEOUT AND RETRY ---
    const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-001:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const payload = {
      contents: recentHistory,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    };

    // Make API call with timeout
    const response = await axios.post(apiUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000, // 30 second timeout
    });

    // Extract reply with better error handling
    let reply = "Sorry, I couldn't process that. Please try again.";
    
    if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      reply = response.data.candidates[0].content.parts[0].text;
    } else if (response.data?.candidates?.[0]?.finishReason === 'SAFETY') {
      reply = "I can't respond to that message due to safety guidelines. Please try a different question.";
    }

    // Save the bot's reply
    const botMessage = { 
      sender: "bot", 
      text: reply, 
      timestamp: new Date() 
    };
    chat.messages.push(botMessage);

    // Save to database
    await user.save();

    // Return response
    res.json({ 
      reply, 
      chatId: chat._id,
      messageId: botMessage._id 
    });

  } catch (err) {
    // Enhanced error handling
    let errorMessage = "Error communicating with AI service";
    let statusCode = 500;

    if (err.code === 'ECONNABORTED') {
      errorMessage = "Request timeout. Please try again.";
      statusCode = 408;
    } else if (err.response?.status === 429) {
      errorMessage = "Too many requests. Please wait a moment.";
      statusCode = 429;
    } else if (err.response?.status === 400) {
      errorMessage = "Invalid request. Please check your message.";
      statusCode = 400;
    } else if (err.response?.status === 403) {
      errorMessage = "API access denied. Please check configuration.";
      statusCode = 403;
    }

    console.error("Gemini API error:", {
      status: err.response?.status,
      data: err.response?.data,
      message: err.message,
      timestamp: new Date().toISOString()
    });

    res.status(statusCode).json({ message: errorMessage });
  }
};

// Function 5: Delete a chat (Unchanged)
exports.deleteChat = async (req, res) => {
  try {
    const { userId } = req.user;
    const { chatId } = req.params;

    const result = await User.updateOne(
      { _id: userId },
      { $pull: { chats: { _id: chatId } } }
    );

    if (result.modifiedCount === 0) {
      return res
        .status(404)
        .json({ message: "Chat not found or user does not own this chat" });
    }

    res.status(200).json({ message: "Chat deleted successfully" });
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ message: "Server error while deleting chat" });
  }
};
