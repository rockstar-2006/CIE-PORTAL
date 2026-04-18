import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { source } = req.body;

  try {
    // We use the official Dart Services (Free)
    const response = await axios.post('https://dart-services.appspot.com/api/dartservices/v2/compile', { source });
    
    // The response is a JS bundle. We return it to the frontend.
    return res.status(200).json({ 
      js: response.data.result,
      status: 'success' 
    });
  } catch (error) {
    console.error("Compilation Error:", error.response?.data || error.message);
    return res.status(200).json({ 
      error: 'Syntax Error: Please check your Dart code structure.' 
    });
  }
}
