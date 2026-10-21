export async function prepareProfileImage(file: File, kind: 'avatar' | 'cover') {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw Error('Chọn ảnh JPG, PNG hoặc WebP.');
  if (file.size > 10 * 1024 * 1024) throw Error('Chọn ảnh nhỏ hơn 10 MB.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error('Không đọc được ảnh này. Hãy chọn ảnh khác.');
  }
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw Error('Ảnh quá lớn. Chọn ảnh dưới 40 megapixel.');
    const canvas = document.createElement('canvas');
    canvas.width = kind === 'avatar' ? 512 : 1200;
    canvas.height = kind === 'avatar' ? 512 : 450;
    const context = canvas.getContext('2d');
    if (!context) throw Error('Chưa xử lý được ảnh.');
    context.fillStyle = '#FAF8F5';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
    const width = bitmap.width * scale,
      height = bitmap.height * scale;
    context.drawImage(
      bitmap,
      (canvas.width - width) / 2,
      (canvas.height - height) / 2,
      width,
      height,
    );
    for (const quality of [0.82, 0.65, 0.45, 0.3]) {
      const jpeg = canvas.toDataURL('image/jpeg', quality).split(',')[1];
      if (jpeg.length <= 245760) return jpeg;
    }
    throw Error('Ảnh còn quá nặng. Hãy chọn ảnh khác.');
  } finally {
    bitmap.close();
  }
}
