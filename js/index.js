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
    $mainActivity.slideDown();
  }
}

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
  pullRequestReviewCommentEvent: 'commented on pull request <a href="'
  + '<%=status.payload.comment._links.html.href%>">'
  + '<%=status.pull_request_number%></a> on <a href="http://github.com/'
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
  else if (status.type === 'PullRequestReviewCommentEvent') {
    status.pull_request_number = /[0-9]+$/.exec(status.payload.comment.pull_request_url)[0];
    return tmpl( template.pullRequestReviewCommentEvent, {status: status} );
  }
}

var $mainActivity = $(".main.activity");
var $githubActivity = $(".github-activity");

var dateTemplate = '<span class="date">' +
  'on <%=created_at.format("MMM Do") %></span>';

var showGithub = function(result) {
  var data = result.data;
  var $ul = $("<ul>");
  $githubActivity.append($ul);
  data.filter(function(status) {
    return status.type !== 'PushEvent';
  }).slice(0, 3).map(function (status) {
    var $li = $("<li>", { 'class': 'github-bgicon' });
    status.created_at = moment(status.created_at);
    var date = tmpl(dateTemplate, {created_at: status.created_at});
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

// stackoverflow
var $stackoverflowActivity= $(".stackoverflow-activity");

var stackoverflowTemplate = '<a href="<%=link %>"><%=text %></a> <%=title %>';

var parseStackoverflowItem = function( item ) {
  var text="", title="", link="",
  stackoverflow_link = "http://stackoverflow.com/users/" + "123984",
  question_link = "http://stackoverflow.com/questions/";

  if(item.timeline_type === "badge") {
    text = "was awarded the '" + item.detail + "' badge";
    link = stackoverflow_link + "?tab=reputation";
  }
  else if (item.timeline_type === "comment") {
    text = "commented on";
    title = item.description;
    link = question_link + item.post_id;
  }
  else if (item.timeline_type === "revision"
        || item.timeline_type === "accepted"
        || item.timeline_type === "askoranswered") {
    text = (item.timeline_type === 'askoranswered' ?
           item.action : item.action + ' ' + item.post_type);
    title = item.detail || item.description || "";
    link = question_link + item.post_id;
  }
  return tmpl(stackoverflowTemplate, {
    link: link,
    title: title,
    text: text
  });
},
convertDate = function( date ) {
  return new Date(date * 1000);
};

var showStackoverflow = function(result) {
  var $ul = $("<ul>");
  $stackoverflowActivity.append($ul);
  result.items.map(function (status) {
    var $li = $("<li>", { 'class': 'stackoverflow-bgicon' });
    var created_at = moment.unix(status.creation_date);
    var date = tmpl(dateTemplate, {created_at: created_at});
    $li.html(parseStackoverflowItem(status) + ' ' + date);
    $ul.append($li);
    //   date: new Date(status.created_at),
  });
  notifyCompleted('.stackoverflow-activity');
}

$.ajax({
  url: "https://api.stackexchange.com/2.2/users/" + "123984" +
         "/timeline?site=stackoverflow",
  data: {
    pagesize: 2
  },
  dataType: "jsonp",
  jsonp: 'jsonp',
  success: showStackoverflow
});
