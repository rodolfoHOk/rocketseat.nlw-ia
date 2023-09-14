import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { fetchFile } from '@ffmpeg/util';
import { FileVideo, Upload } from 'lucide-react';
import { Separator } from './ui/separator';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Button } from './ui/button';
import { getFFmpeg } from '@/lib/ffmpeg';
import { api } from '@/lib/axios';

type Status =
  | 'waiting'
  | 'converting'
  | 'uploading'
  | 'generating'
  | 'success'
  | 'error';

const statusMessages = {
  converting: 'Convertendo...',
  uploading: 'Carregando...',
  generating: 'Transcrevendo...',
  success: 'Sucesso!',
  error: 'Erro!',
};

interface VideoInputFormProps {
  onVideoUploaded: (videoId: string) => void;
}

export function VideoInputForm({ onVideoUploaded }: VideoInputFormProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>('waiting');

  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.currentTarget;

    if (!files) {
      return;
    }

    const selectedFile = files[0];

    setVideoFile(selectedFile);
  }

  async function convertVideoToAudio(video: File): Promise<File> {
    console.log('Convert started...');

    const ffmpeg = await getFFmpeg();

    await ffmpeg.writeFile('input.mp4', await fetchFile(video));

    // ffmpeg.on('log', (log) => {
    //   console.log(log);
    // });

    ffmpeg.on('progress', (progress) => {
      console.log('Convert progress: ' + Math.round(progress.progress * 100));
    });

    await ffmpeg.exec([
      '-i',
      'input.mp4',
      '-map',
      '0:a',
      '-b:a',
      '20k',
      '-acodec',
      'libmp3lame',
      'output.mp3',
    ]);

    const data = await ffmpeg.readFile('output.mp3');

    const audioFileBlob = new Blob([data], { type: 'audio/mpeg' });
    const audioFile = new File([audioFileBlob], 'audio.mp3', {
      type: 'audio/mpeg',
    });

    console.log('Convert finished.');

    return audioFile;
  }

  async function handleUploadVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const prompt = promptInputRef.current?.value;

    if (!videoFile) {
      return;
    }

    setStatus('converting');
    const audioFile = await convertVideoToAudio(videoFile);

    const data = new FormData();
    data.append('file', audioFile);
    setStatus('uploading');
    const response = await api.post('/videos', data);

    const videoId = response.data.id;
    setStatus('generating');
    await api
      .post(`/videos/${videoId}/transcription`, {
        prompt,
      })
      .then(
        () => {
          setStatus('success');
        },
        () => {
          setStatus('error');
        }
      );

    onVideoUploaded(videoId);
  }

  const previewUrl = useMemo(() => {
    if (!videoFile) {
      return null;
    }

    return URL.createObjectURL(videoFile);
  }, [videoFile]);

  return (
    <form className="space-y-6" onSubmit={handleUploadVideo}>
      <label
        className="relative border flex rounded-md aspect-video cursor-pointer border-dashed text-sm flex-col gap-2 items-center justify-center text-muted-foreground hover:bg-primary/5"
        htmlFor="video"
      >
        {previewUrl ? (
          <video
            src={previewUrl}
            controls={false}
            className="pointer-events-none absolute inset-0"
          />
        ) : (
          <>
            <FileVideo className="w-4 h-4" />
            Selecione um vídeo
          </>
        )}
      </label>

      <input
        className="sr-only"
        type="file"
        id="video"
        accept="video/mp4"
        onChange={handleFileSelected}
      />

      <Separator />

      <div className="space-y-2">
        <Label htmlFor="transcription_prompt">Prompt de transcrição</Label>

        <Textarea
          id="transcription_prompt"
          ref={promptInputRef}
          className="h-20 leading-relaxed resize-none"
          placeholder="Inclua palavras-chaves mencionadas no vídeo separadas por vírgula (,)"
          disabled={status !== 'waiting'}
        />
      </div>

      <Button
        type="submit"
        data-success={status === 'success'}
        data-error={status === 'error'}
        disabled={status !== 'waiting'}
        className="w-full data-[success=true]:bg-emerald-400 data-[error=true]:bg-red-400"
      >
        {status === 'waiting' ? (
          <>
            Carregar vídeo
            <Upload className="w-4 h-4 ml-2" />
          </>
        ) : (
          statusMessages[status]
        )}
      </Button>
    </form>
  );
}