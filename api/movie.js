function getUpstreamBase() {
  return process.env.YTS_API_BASE || 'https://movies-api.accel.li/api/v2/';
}

module.exports = async (req, res) => {
  try {
    const imdbid = typeof req.query.imdbid === 'string' ? req.query.imdbid : '';
    if (!imdbid) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ status: 'error', status_message: 'Missing imdbid' }));
      return;
    }

    const upstreamBase = getUpstreamBase();
    const upstreamUrl = new URL('list_movies.json', upstreamBase);
    upstreamUrl.searchParams.set('query_term', imdbid);

    const upstreamResp = await fetch(upstreamUrl.toString(), {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'accept-encoding': 'identity',
      },
      redirect: 'manual',
    });

    const buf = Buffer.from(await upstreamResp.arrayBuffer());
    const text = buf.toString('utf8');
    let upstreamJson;
    try {
      upstreamJson = JSON.parse(text);
    } catch {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ status: 'error', status_message: 'Upstream returned non-JSON' }));
      return;
    }

    const movie = upstreamJson && upstreamJson.data && Array.isArray(upstreamJson.data.movies) ? upstreamJson.data.movies[0] : null;

    if (!movie) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ status: 'error', status_message: 'Movie not found' }));
      return;
    }

    const out = {
      status: 'ok',
      status_message: 'Query was successful',
      data: {
        movie,
      },
    };

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out));
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        status: 'error',
        status_message: 'Upstream fetch failed',
        error: String(err && err.message ? err.message : err),
      })
    );
  }
};
