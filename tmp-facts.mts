import { readTrack } from './electron/services/tag-io.ts'

for (const path of ['tests/fixtures/sample.m4a', 'tests/fixtures/sample.m4a.tmp.m4a']) {
  const snapshot = readTrack(path)
  console.log('---', path)
  console.log(
    JSON.stringify(
      {
        error: snapshot.error,
        codec: snapshot.tech.codec,
        container: snapshot.tech.container,
        encoder: snapshot.tech.encoder,
        tagTypes: snapshot.tech.tagTypes,
        lossless: snapshot.tech.lossless,
        bitrate: snapshot.tech.bitrate,
        duration: snapshot.tech.durationMs,
        rate: snapshot.tech.sampleRate,
        channels: snapshot.tech.channels,
        bits: snapshot.tech.bitsPerSample,
        facts: snapshot.tech.facts.map((fact) => `${fact.key} = ${fact.value.slice(0, 160)}`)
      },
      null,
      2
    )
  )
}
