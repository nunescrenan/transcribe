import express from 'express';
import multer from 'multer';
import fs from 'fs';
import axios from 'axios';
import FormData from 'form-data';
import path from 'path';

const app = express();
const upload = multer({ dest: 'uploads/' });

const ASSEMBLYAI_API_KEY = 'YOUR_ASSEMBLY_KEY';
const OPENROUTER_API_KEY = 'YOUR_OPENROUTER_KEY';

app.use(express.static('public'));

function substituirCodigos(texto) {
  const mapa = {
    'CDG': 'Código para troca aqui.'
  };

  for (const codigo in mapa) {
    const regex = new RegExp(`\\b${codigo}\\b`, 'g');
    texto = texto.replace(regex, mapa[codigo]);
  }
  return texto;
}

app.post('/get', upload.single('audio'), async (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  const audioPath = req.file.path;

  function stream(text) {
    res.write(text + '\n');
  }

  try {
    // Upload
    stream(' ');
    const form = new FormData();
    form.append('file', fs.createReadStream(audioPath));

    const uploadRes = await axios.post('https://api.assemblyai.com/v2/upload', form, {
      headers: {
        authorization: ASSEMBLYAI_API_KEY,
        ...form.getHeaders(),
      }
    });

    // Transcrição
    const audioUrl = uploadRes.data.upload_url;
    stream('🎙️ Transcrevendo...');
    const transcriptRes = await axios.post(
      'https://api.assemblyai.com/v2/transcript',
      { audio_url: audioUrl, language_code: 'pt' },
      { headers: { authorization: ASSEMBLYAI_API_KEY } }
    );

    const transcriptId = transcriptRes.data.id;

    let texto = '';
    while (true) {
      const check = await axios.get(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { authorization: ASSEMBLYAI_API_KEY },
      });

      if (check.data.status === 'completed') {
        texto = check.data.text;
        break;
      }
      if (check.data.status === 'error') throw new Error('Erro na transcrição');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    stream('🔁 Substituindo códigos médicos...');
    const textoSubstituido = substituirCodigos(texto);
    
    stream('🧠 Corrigindo com IA...');

    const prompt = `
Seu Script Para Organização Aqui!

texto:
${textoSubstituido}
`;

    const corrigeRes = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'mistralai/mistral-7b-instruct',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://seuapp.com',
          'X-Title': 'laudo-medico-cleaner'
        }
      }
    );

    const finalText = corrigeRes.data.choices[0].message.content;
    fs.writeFileSync(`public/laudo-final.txt`, finalText, 'utf8');
    stream('✅ Laudo final salvo.');
    stream('[DOWNLOAD] /laudo-final.txt');


    res.end('\n\n🎉 Finalizado com sucesso.');
  } catch (err) {
    stream(`❌ Erro: ${err.message}`);
    res.end();
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.listen(8080, () => {
  console.log('Servidor rodando em http://localhost:8080');
});
