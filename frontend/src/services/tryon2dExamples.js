const EXAMPLES = [
  ['/examples/tryon2d/person-generated-v1.png', 'onfit-example-person.png'],
  ['/examples/tryon2d/shirt-generated-v1.png', 'onfit-example-shirt.png'],
]

export async function loadTryOnExamples({fetcher=globalThis.fetch,signal}={}) {
  const files=await Promise.all(EXAMPLES.map(async([url,name])=>{
    const response=await fetcher(url,{signal})
    if(!response.ok)throw new Error('예시 이미지를 불러오지 못했습니다.')
    const blob=await response.blob()
    if(blob.type!=='image/png'||!blob.size||blob.size>8*1024*1024)throw new Error('예시 이미지 파일 형식을 확인하세요.')
    return new File([blob],name,{type:'image/png'})
  }))
  signal?.throwIfAborted()
  return {personImage:files[0],garmentImage:files[1]}
}
