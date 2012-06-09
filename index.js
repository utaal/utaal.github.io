// Simple JavaScript Templating
// John Resig - http://ejohn.org/ - MIT Licensed
(function(){
  var cache = {};
  
  this.tmpl = function tmpl(str, data){
    // Figure out if we're getting a template, or if we need to
    // load the template - and be sure to cache the result.
    var fn = !/\W/.test(str) ?
      cache[str] = cache[str] ||
        tmpl(document.getElementById(str).innerHTML) :
      
      // Generate a reusable function that will serve as a template
      // generator (and which will be cached).
      new Function("obj",
        "var p=[],print=function(){p.push.apply(p,arguments);};" +
        
        // Introduce the data as local variables using with(){}
        "with(obj){p.push('" +
        
        // Convert the template into pure JavaScript
        str
          .replace(/[\r\t\n]/g, " ")
          .split("<%").join("\t")
          .replace(/((^|%>)[^\t]*)'/g, "$1\r")
          .replace(/\t=(.*?)%>/g, "',$1,'")
          .split("\t").join("');")
          .split("%>").join("p.push('")
          .split("\r").join("\\'")
      + "');}return p.join('');");
    
    // Provide some basic currying to the user
    return data ? fn( data ) : fn;
  };
})();

var WAIT_FOR = 2;
var notifyCompleted = function(id) {
  --WAIT_FOR;
  if (WAIT_FOR == 0) {
    $twitterActivity.slideDown();
    $githubActivity.slideDown();
  }
}

// Twitter
var linkify = function( tweet ) {
  var link = function( t ) {
    return t.replace(
      /[a-z]+:\/\/[a-z0-9-_]+\.[a-z0-9-_:~%&\?\/.=]+[^:\.,\)\s*$]/ig,
      function( m ) {
        return '<a href="' + m + '">'
          + ( ( m.length > 25 ) ? m.substr( 0, 24 ) + '...' : m )
          + '</a>';
      }
    );
  },
  at = function( t ) {
    return t.replace(
      /(^|[^\w]+)\@([a-zA-Z0-9_]{1,15})/g,
      function( m, m1, m2 ) {
        return m1 + '<a href="http://twitter.com/' + m2 + '">@'
          + m2 + '</a>';
      }
    );
  },
  hash = function( t ) {
    return t.replace(
      /(^|[^\w'"]+)\#([a-zA-Z0-9_]+)/g,
      function( m, m1, m2 ) {
        return m1 + '<a href="http://search.twitter.com/search?q=%23'
        + m2 + '">#' + m2 + '</a>';
      }
    );
  };

  return hash(at(link(tweet)));
}

var $twitterActivity = $(".twitter-activity");

var parseTwitter = function(data) {
//  var data = data.slice(0, 5);
  var $ul = $("<ul>");
  $twitterActivity.append($ul);
  data.map(function (status) {
    var $li = $("<li>", { 'class': 'twitter-bgicon' });
    $li.html(linkify(status.text));
    $ul.append($li);
    //   date: new Date(status.created_at),
  });
  notifyCompleted('.twitter-activity');
};

$.ajax({
  url: "https://api.twitter.com/1/statuses/user_timeline.json",
  data: {
    screen_name: "utaal",
    include_rts: 1, // Include retweets
    exclude_replies: true,
    count: 3
  },
  dataType: 'jsonp',
  success: parseTwitter 
});

// GitHub
var template = {
  commitCommentEvent: 'commented on <a href="http://github.com/'
  + '<%=status.repo.name%>"><%=status.repo.name%></a>',
  createBranchEvent: 'created branch <a href="http://github.com/'
  + '<%=status.repo.name%>/tree/<%=status.payload.ref%>">'
  + '<%=status.payload.ref%></a> at <a href="http://github.com/'
  + '<%=status.repo.name%>"><%=status.repo.name%></a>',
  createRepositoryEvent: 'created repository <a href="http://github.com/'
  + '<%=status.repo.name%>"><%=status.repo.name%></a>',
  createTagEvent: 'created tag <a href="http://github.com/'
  + '<%=status.repo.name%>/tree/<%=status.payload.ref%>">'
  + '<%=status.payload.ref%></a> at <a href="http://github.com/'
  + '<%=status.repo.name%>"><%=status.repo.name%></a>',
  deleteBranchEvent: 'deleted branch <%=status.payload.ref%> at '
  + '<a href="http://github.com/<%=status.repo.name%>">'
  + '<%=status.repo.name%></a>',
  deleteTagEvent: 'deleted tag <%=status.payload.ref%> at '
  + '<a href="http://github.com/<%=status.repo.name%>">'
  + '<%=status.repo.name%></a>',
  followEvent: 'started following <a href="http://github.com/'
  + '<%=status.payload.target.login%>"><%=status.payload.target.login%></a>',
  forkEvent: 'forked <a href="http://github.com/<%=status.repo.name%>">'
  + '<%=status.repo.name%></a>',
  gistEvent: '<%=status.payload.action%> gist '
  + '<a href="http://gist.github.com/<%=status.payload.gist.id%>">'
  + '<%=status.payload.gist.id%></a>',
  issueCommentEvent: 'commented on issue <a href="http://github.com/'
  + '<%=status.repo.name%>/issues/<%=status.payload.issue.number%>">'
  + '<%=status.payload.issue.number%></a> on <a href="http://github.com/'
  + '<%=status.repo.name%>"><%=status.repo.name%></a>',
  issuesEvent: '<%=status.payload.action%> issue '
  + '<a href="http://github.com/<%=status.repo.name%>/issues/'
  + '<%=status.payload.issue.number%>"><%=status.payload.issue.number%></a> '
  + 'on <a href="http://github.com/<%=status.repo.name%>">'
  + '<%=status.repo.name%></a>',
  pullRequestEvent: '<%=status.payload.action%> pull request '
  + '<a href="http://github.com/<%=status.repo.name%>/pull/'
  + '<%=status.payload.number%>"><%=status.payload.number%></a> on '
  + '<a href="http://github.com/<%=status.repo.name%>">'
  + '<%=status.repo.name%></a>',
  pushEvent: 'pushed to <a href="http://github.com/<%=status.repo.name%>'
  + '/tree/<%=status.payload.ref%>"><%=status.payload.ref%></a> at '
  + '<a href="http://github.com/<%=status.repo.name%>">'
  + '<%=status.repo.name%></a>',
  watchEvent: 'started watching <a href="http://github.com/'
  + '<%=status.repo.name%>"><%=status.repo.name%></a>'
};

var parseGithubStatus = function( status ) {
  if (status.type === 'CommitCommentEvent' ) {
    return tmpl( template.commitCommentEvent, {status: status} );
  }
  else if (status.type === 'CreateEvent'
        && status.payload.ref_type === 'branch') {
    return tmpl( template.createBranchEvent, {status: status} );
  }
  else if (status.type === 'CreateEvent'
        && status.payload.ref_type === 'repository') {
    return tmpl( template.createRepositoryEvent, {status: status} );
  }
  else if (status.type === 'CreateEvent'
        && status.payload.ref_type === 'tag') {
    return tmpl( template.createTagEvent, {status: status} );
  }
  else if (status.type === 'DeleteEvent'
        && status.payload.ref_type === 'branch') {
    return tmpl( template.deleteBranchEvent, {status: status} );
  }
  else if (status.type === 'DeleteEvent'
        && status.payload.ref_type === 'tag') {
    return tmpl( template.deleteTagEvent, {status: status} );
  }
  else if (status.type === 'FollowEvent' ) {
    return tmpl( template.followEvent, {status: status} );
  }
  else if (status.type === 'ForkEvent' ) {
    return tmpl( template.forkEvent, {status: status} );
  }
  else if (status.type === 'GistEvent' ) {
    if (status.payload.action === 'create') {
      status.payload.action = 'created'
    } else if (status.payload.action === 'update') {
      status.payload.action = 'updated'
    }
    return tmpl( template.gistEvent, {status: status} );
  }
  else if (status.type === 'IssueCommentEvent' ) {
    return tmpl( template.issueCommentEvent, {status: status} );
  }
  else if (status.type === 'IssuesEvent' ) {
    return tmpl( template.issuesEvent, {status: status} );
  }
  else if (status.type === 'PullRequestEvent' ) {
    return tmpl( template.pullRequestEvent, {status: status} );
  }
  else if (status.type === 'PushEvent' ) {
    status.payload.ref = status.payload.ref.split('/')[2];
    return tmpl( template.pushEvent, {status: status} );
  }
  else if (status.type === 'WatchEvent' ) {
    return tmpl( template.watchEvent, {status: status} );
  }
}

var $githubActivity = $(".github-activity");

var dateTemplate = '<span class="date">' +
  'on <%=status.created_at.format("MMM Do") %></span>';

var showGithub = function(result) {
  var data = result.data;
  var $ul = $("<ul>");
  $githubActivity.append($ul);
  data.filter(function(status) {
    return status.type !== 'PushEvent';
  }).slice(0, 3).map(function (status) {
    var $li = $("<li>", { 'class': 'github-bgicon' });
    status.created_at = moment(status.created_at);
    var date = tmpl(dateTemplate, {status: status});
    $li.html(parseGithubStatus(status) + ' ' + date);
    $ul.append($li);
    //   date: new Date(status.created_at),
  });
  notifyCompleted('.github-activity');
}

$.ajax({
  url: 'https://api.github.com/users/utaal/events/public'
, dataType: 'jsonp'
, success: showGithub
});
