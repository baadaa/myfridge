$(document).ready(function() {

  // Initialize Firebase
  var config = {
    apiKey: "AIzaSyBYjvjsGuAPDEfbIri0qDOeOUdAmYh4UCE",
    authDomain: "my-fridge-app.firebaseapp.com",
    databaseURL: "https://my-fridge-app.firebaseio.com",
    storageBucket: "my-fridge-app.appspot.com",
    messagingSenderId: "602672984309"
  };

  firebase.initializeApp(config);
  var db = firebase.database();
  var USER = { // for user-specific db setup
    fridge: '',
    freezer: '',
    list: '',
    name: '',
    photo: ''
  };

  var firebaseAuth = firebase.auth(); // authentication object
	var google = new firebase.auth.GoogleAuthProvider(); // object for Google authentication
  var fb = new firebase.auth.FacebookAuthProvider();
  // listen for auth state change
	firebaseAuth.onAuthStateChanged(function(user) {
		if (user) { // user is logged in
      $('.login-screen').hide();
			// create db tables for data categories
      USER.fridge = db.ref("users/" + user.uid + "/fridge");
      USER.freezer = db.ref("users/" + user.uid + "/freezer");
      USER.list = db.ref("users/" + user.uid + "/list");
      USER.name = user.displayName;
      USER.data = user; // NOTE: for debugging. to remove.
      USER.photo = user.photoURL;
      FridgeApp.init();
      TodoApp.init();
		} else { // user is not logged in
      $('.login-screen').show()
      .css('background', 'rgba(0,0,0,.9)');
      $('span.login-btn').on('click', function(e) {
        var provider = $(e.target).attr('id');
        if (provider === 'google') {
          provider = google;
        } else {
          provider = fb;
        }
        firebase.auth().signInWithRedirect(provider);
        firebase.auth().getRedirectResult().then(function(result){
        }).catch(function(error){
          alert(error.message);
        });
      });
		}
	});

  var Utils = {
    // When taking photos with a mobile device, it sometimes result in rotated images.
    // getOrientation() and resetOrientation() methods detect the proper direction and resets accordingly.
    getOrientation: function(file, callback) {
      var reader = new FileReader();

      reader.onload = function(event) {
        var view = new DataView(event.target.result);

        if (view.getUint16(0, false) != 0xFFD8) return callback(-2);

        var length = view.byteLength,
            offset = 2;

        while (offset < length) {
          var marker = view.getUint16(offset, false);
          offset += 2;

          if (marker == 0xFFE1) {
            if (view.getUint32(offset += 2, false) != 0x45786966) {
              return callback(-1);
            }
            var little = view.getUint16(offset += 6, false) == 0x4949;
            offset += view.getUint32(offset + 4, little);
            var tags = view.getUint16(offset, little);
            offset += 2;

            for (var i = 0; i < tags; i++)
              if (view.getUint16(offset + (i * 12), little) == 0x0112)
                return callback(view.getUint16(offset + (i * 12) + 8, little));
          }
          else if ((marker & 0xFF00) != 0xFF00) break;
          else offset += view.getUint16(offset, false);
        }
        return callback(-1);
      };

      reader.readAsArrayBuffer(file.slice(0, 64 * 1024));
    },
    resetOrientation: function(srcBase64, srcOrientation, callback) {
      var img = new Image();

      img.onload = function() {
        var width = img.width,
            height = img.height,
            max_size = 544,
            canvas = document.createElement('canvas'),
            ctx = canvas.getContext("2d");

        // resize the image
        if (width > height) {
            if (width > max_size) {
                height *= max_size / width;
                width = max_size;
            }
        } else {
            if (height > max_size) {
                width *= max_size / height;
                height = max_size;
            }
        }
        canvas.width = width;
        canvas.height = height;

        // set proper canvas dimensions before transform & export
        if ([5,6,7,8].indexOf(srcOrientation) > -1) {
          canvas.width = height;
          canvas.height = width;
        } else {
          canvas.width = width;
          canvas.height = height;
        }


        // transform context before drawing image
        switch (srcOrientation) {
          case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
          case 3: ctx.transform(-1, 0, 0, -1, width, height ); break;
          case 4: ctx.transform(1, 0, 0, -1, 0, height ); break;
          case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
          case 6: ctx.transform(0, 1, -1, 0, height , 0); break;
          case 7: ctx.transform(0, -1, -1, 0, height , width); break;
          case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
          default: ctx.transform(1, 0, 0, 1, 0, 0);
        }

        // draw image
        ctx.drawImage(img, 0, 0, width, height);

        // export base64
        callback(canvas.toDataURL('image/jpeg', 0.5));
      };

      img.src = srcBase64;
    },
    itemMarkup: function(id, photo, name, quantity, addDate, expDate) {
      if (!photo) {
        photo = "../img/food.svg"; // default image if photo not provided by user
      }
      var str1 =
      '<section class="food-item" data-id="'+ id + '">' +
        '<section class="item-img" style="background-image: url(' + photo + ');">' +
        '</section>' +
        '<section class="item-desc">' +
          '<span class="item-name">' + name + '</span>';
      var str2 = (quantity === "" || quantity === undefined) ? "" :
          '<span class="item-quantity">' + quantity + '</span>';
      var str3 =
          '<span class="added-date">Added at ' + addDate + '</span>';
      var str4 = (expDate === "" || expDate === undefined ) ? "" :
          '<span class="exp-date">Expires at '+ expDate + '</span>';
      var str5 =
        '</section>' +
      '</section>';
      return str1 + str2 + str3 + str4 + str5;
    },
    todoMarkup: function(todoId, content, checked) {
      var liClass = (checked) ? 'class="completed"': '';
      var checkBox = (checked) ? 'checked' : '';
      var string =
        '<li data-id="'+ todoId + '"'+ liClass + '>' +
          '<div class="view">' +
          '<input class="toggle" type="checkbox"' + checkBox + '><label>' + content + '</label>' +
          '<button class="destroy"></button></div>' +
          '<input class="edit" value="'+ content + '">'+
        '</li>';
      return string;
    },
    allTodoComplete: function(todos){
      var cond = todos.every(function(todo) {
        return todo.completed === true;
      });
      return cond;
    },
    someTodoComplete: function(todos) {
      var cond = todos.some(function(todo){
        return todo.completed === true;
      });
      return cond;
    },
  };

  var FridgeApp = {
    UI: {
      currentView: "listView",
      currentArea: "fridge",
      currentEdit: "",
      currentItemDetails: "",
      slideOpen: false,
      today: new Date(),
      takePicture: document.querySelector('input[name="i-image"]'),
      photo: '',
      touchPoint: '',
      swiped: [],
      swipeEraseMsg: function(itemName) {
        var str =
          '<div class="swipeToRemove">' +
          '<h1>Remove <span>' + itemName + '</span> from fridge?</h1>' +
          '<ul class="swipe-btns">' +
            '<li id="swipe-y">Yes</li>' +
            '<li id="swipe-n">No</li>' +
          '</ul>' +
          '</div>';
        return str;
      },
      dateConfig: {
        add: {
          altInput: true,
          altFormat: "M j, Y",
          dateFormat: "M j, Y",
        },
        edit: function(date) {
          return {
            defaultDate: date,
            altInput: true,
            altFormat: "M j, Y",
            dateFormat: "M j, Y",
          };
        }
      }
    },
    init: function() {
      $('footer .year').text(this.UI.today.getFullYear()); // copyright footer
      $('input[name="i-date"]').attr('placeholder', this.formatDate(this.UI.today)); // today's date as placeholder
      $('#removeConfirm').hide();
      this.bindEvents();
      $('.user-photo img').attr('src', USER.photo);
      // $('.user-name').text(USER.name);
      // console.log(USER.photo);
      // console.log(USER.data);

      // console.log('launch app', 'slideOpen:', this.UI.slideOpen);

    },
    formatDate: function(date) {
      var monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];
      var day = date.getDate();
      var monthIndex = date.getMonth();
      var year = date.getFullYear();
      return monthNames[monthIndex] + ' ' + day + ', ' + year;
    },
    bindEvents: function() {

      $('ul.nav-items').on('touch click', 'li', this.toggleNav.bind(this));
      $(document).on('keydown', this.checkForEscape.bind(this));
      $('.add-item').on('touch click', this.addItem.bind(this));
      $('#add-btn').on('touch click', this.registerNew.bind(this));
      $('#save-btn').on('touch click', this.updateItem.bind(this));
      $('#remove-btn').on('touch click', this.showRemoveModal.bind(this));
        $('li#n-btn').on('touch click', this.cancelRemove.bind(this));
        $('li#y-btn').on('touch click', this.confirmRemove.bind(this));
      $('#cancel-btn, #abort-btn').on('touch click', this.cancelOverlay.bind(this));

      $('.todo-btn, .close-panel').on('touch click', this.openTodo.bind(this));
      $('section.item-list').on('touch click', '.food-item', this.editItem.bind(this));

      $('section.item-list').on('touchstart', '.food-item', this.touchStart.bind(this));
      $('section.item-list').on('touchend', '.food-item', this.touchEnd.bind(this));
      $('input').on('focus', this.unhighlightFields.bind(this));

      $('.logout-btn').on('touch click', this.signOut.bind(this));

      this.UI.takePicture.onchange = this.takePhoto.bind(this);
      USER.freezer.on('value', this.render.bind(this));
      USER.fridge.on('value', this.render.bind(this));
    },
    checkForEscape: function(e) {
      if (e.which === 27) {
        if (this.UI.slideOpen) {
          // Shopping list panel is open. Cancel new item input.
          $('.new-todo').val("");
        } else if (this.UI.currentView === 'listView') {
          // do nothing on default view
        } else if (($('input[name="i-exp"]')[0]._flatpickr.isOpen) || ($('input[name="i-date"]')[0]._flatpickr.isOpen)) {
          // Calendar is open. Flatpickr will take care of this case
        } else {
          this.setView('listView');
        }
      }
    },
    signOut: function(){
      // console.log('signout');
      firebase.auth().signOut();
    },
    touchStart: function(e) {
      // e.preventDefault();
      this.UI.touchPoint = {x: e.originalEvent.touches[0].pageX, y: e.originalEvent.touches[0].pageY }; // point where touch begins
    },
    cancelSwipe: function (id) {
      var item = _.findWhere(this.UI.swiped, {id: id});
      $(item.section).css('background', '#FFF');
      $(item.section).html(item.content);
      $(item.section).attr('data-swipe', '');
      this.UI.swiped = _.without(this.UI.swiped, item);
    },
    cancelSwipeAll: function() {
      if (this.UI.swiped.length !== 0) {
        this.UI.swiped.forEach(function(item) {
          $(item.section).css('background', '#FFF');
          $(item.section).html(item.content);
          $(item.section).attr('data-swipe', '');
        });
        this.UI.swiped = [];
      }
    },
    swipeConfirm: function(id) {
      var item = _.findWhere(this.UI.swiped, {id: id});
      USER[this.UI.currentArea].child(id).remove();
      this.UI.swiped = _.without(this.UI.swiped, item);
    },
    touchEnd: function(e) {
      e.preventDefault();
      var currentP = {x: e.originalEvent.changedTouches[0].pageX, y: e.originalEvent.changedTouches[0].pageY }; // point where touch ends
      if ((this.UI.touchPoint.x === currentP.x) && (this.UI.touchPoint.y === currentP.y)){
        var btn = $(e.target).closest('li').attr('id');
        var id = $(e.target).closest('section').attr('data-id');
          if (btn==='swipe-y') {
            this.swipeConfirm(id);
          } else if (btn==='swipe-n') {
            this.cancelSwipe(id);
          } else {
            this.editItem(e);
          }
      } else if (this.UI.touchPoint.x - currentP.x > 100) { // detect swipe left bigger than 50 pixels
        var item = $(e.target).closest('section.food-item');
        if (!$(item).attr('data-swipe')) {
          $(item).attr('data-swipe', 'true');
          $(item).addClass('food-item-swipe');

          this.swipeToErase(item);
        }
      }
    },
    swipeToErase: function(item) {
      var itName = $(item).find('span.item-name').text();

      var itemInfo = {
        id: $(item).attr('data-id'),
        section: $(item),
        content: $(item).html()
      };
      this.UI.swiped.push(itemInfo);

      $(item).css('background', '#F2AF00');
      $(item).html(this.UI.swipeEraseMsg(itName));
    },
    renderItemList: function(area) {
      this.setView('loading');
      var _this = this;

      USER[area].once('value').then(function(snapshot) {
          _this.render(snapshot);
        });
    },
    removeItemList: function() {
      $('section.item-list').find('*').not('div, img').remove();
    },
    toggleNav: function(e) {
      var clickedNav = $(e.target);
      var targetArea = $(clickedNav).html().toLowerCase();
      $(clickedNav).addClass('selected');
      $('ul.nav-items li').not(clickedNav).removeClass('selected');

      if (this.UI.currentArea === targetArea) {
        return;
      } else {
        this.removeItemList(this.UI.currentArea);
        this.UI.currentArea = targetArea;
        $('div.add-item span').text(targetArea);
        this.renderItemList(targetArea);
        this.changeBodyBg();
      }
    },
    changeBodyBg: function() {
      var bodyBg;
      switch (this.UI.currentArea) {
        case "fridge":
          bodyBg = 'url("../img/pat.png")';
          break;
        case "freezer":
          bodyBg = 'url("../img/pat-2.png")';
          break;
        default:
          break;
      }
      $('body').css('background-image', bodyBg).fadeIn(2000);
    },
    addItem: function() {
      $('.adding-item h1').text('Add an item');
      $('input[name="i-date"], input[name="i-exp"]').flatpickr(this.UI.dateConfig.add);
      this.setView('addItem');
    },
    editItem: function(e) {

      this.cancelSwipeAll();
      var clicked = $(e.target).closest('section.food-item');

      if (!$(clicked).attr('data-swipe')) {

        this.setView('loading');
        $('.adding-item h1').text('Edit an item');

        var _this = this;
        var itemDetails;
        var clickedItem = $(e.target).closest('section.food-item').attr('data-id');

        USER[this.UI.currentArea].child(clickedItem).on('value', function(data) {
          itemDetails = data.val();
          _this.UI.currentEdit = clickedItem;
          _this.UI.currentItemDetails = itemDetails;
          _this.setView('editItem');
          _this.setEditingContents(itemDetails);
        });
      }
    },
    updateItem: function(){
      console.log($('input[name="i-exp"]'));
      debugger;
      var updated = this.getItemInfo("existing");
      if (this.requiredFieldsComplete(updated.img, updated.name, updated.added)) {
        USER[this.UI.currentArea].child(this.UI.currentEdit).update(updated);
        this.setView('listView');
        this.resetInputFields();
      } else {
        $('.msg').show();
      }
    },
    showRemoveModal: function(item) {
      $('.remove-msg span').text(this.UI.currentArea);
      $('#removeConfirm').fadeIn(200);
    },
    confirmRemove: function() {
      USER[this.UI.currentArea].child(this.UI.currentEdit).remove();
      $('#removeConfirm').hide();
      this.setView('listView');
    },
    cancelRemove: function() {
      $('#removeConfirm').fadeOut(200);
    },
    setEditingContents: function(item) {
      var imgString = item.img || "../img/food.svg";
      $('.editing-fields div.photo').css('background-image', 'url("' + imgString + '")')
      .css('background-size', 'cover');
      $('input[name="i-name"]').val(item.name);
      $('input[name="i-quantity"]').val(item.qty);
      $('input[name="i-date"]').flatpickr(this.UI.dateConfig.edit(item.added));
      $('input[name="i-exp"]').flatpickr(this.UI.dateConfig.edit(item.exp));
    },
    render: function(response) {
      var responseVal = response.val();
      var rIdentifiers = _.keys(responseVal);
      var uItems = _.map(rIdentifiers, function(id) {
        var iObj = responseVal[id];
        return {
          id: id,
          name: iObj.name,
          img: iObj.img,
          qty: iObj.qty,
          added: iObj.added,
          exp: iObj.exp
        };
      });

      var itemStr = "";
      uItems.forEach(function(item) {
        itemStr += Utils.itemMarkup(item.id, item.img, item.name, item.qty, item.added, item.exp);

      });
      $('section.item-list').not('div, img').html(itemStr);
      this.setView('listView');
    },
    takePhoto: function(e) {
      var _this = this,
          files = e.target.files,
          imgTag = $('label.photo-file img'),
          imgBox = $('div.photo'),
          imgUrl;
      if (files && files.length > 0) {
          this.UI.photo = files[0];
      }
      imgUrl = window.URL.createObjectURL(this.UI.photo);

      Utils.getOrientation(this.UI.photo, function(orientation) {
        Utils.resetOrientation(imgUrl, orientation, function(resetBase64Image) {
          $(imgBox).css('background-image', 'url("' + resetBase64Image + '")')
          .css('background-size', 'cover');
          _this.UI.photo = resetBase64Image;
        });
      });
    },
    setView: function(viewType) {

      if (this.UI.slideOpen) {
        return;
      }

      switch (viewType) {
        case "loading":
          $('section.loading-anim').show();
          $('section.adding-item').hide();
          break;
        case "addItem":
          $('section.loading-anim').hide();
          $('section.adding-item').show();
          $('.add-btn-list').show();
          $('.edit-btn-list').hide();
          $('.overlay').css('opacity', '1')
          .fadeIn('200');
          this.UI.currentView = "addItem";
          $('body').addClass('noscroll');
          break;
        case "editItem":
          $('section.loading-anim').hide();
          $('section.adding-item').show();
          $('.add-btn-list').hide();
          $('.edit-btn-list').show();
          $('.overlay').css('opacity', '1')
          .fadeIn('200');
          this.UI.currentView = "editItem";
          $('body').addClass('noscroll');
          break;
        case "listView":
          $('section.loading-anim').hide();
          $('.overlay').fadeOut('200');
          this.UI.currentView = "listView";
          this.resetInputFields();
          $('body').removeClass('noscroll');
          break;
        default:
          break;
      }
    },
    getItemInfo: function(itemType) {
      var photo;
      if (itemType === "new") {
        photo = this.UI.photo || "../img/food.svg";
      } else {
        photo = this.UI.photo || this.UI.currentItemDetails.img;
      }
      var name = $('input[name="i-name"]').val();
      var qty = $('input[name="i-quantity"]').val();
      var addDate = $('input[name="i-date"]').val();
      var expDate = $('input[name="i-exp"]').val();
      return {
        name: name,
        img: photo,
        qty: qty,
        added: addDate,
        exp: expDate
      };
    },
    registerNew: function() {
      var newItem = this.getItemInfo('new');
      if (this.requiredFieldsComplete(newItem.img, newItem.name, newItem.added, newItem.exp)) {
        var htmlString = Utils.itemMarkup(newItem.img, newItem.name, newItem.qty, newItem.added, newItem.exp);
        $('section.item-list').append(htmlString);
        USER[this.UI.currentArea].push(newItem);
        this.setView('listView');
        this.resetInputFields();
      } else {
        $('.msg').show();
        // TODO: highlight incomplete fields
      }
    },
    requiredFieldsComplete: function(img, name, date, exp) {
      if ((name === '') && (img === '../img/food.svg')) {
        this.highlightFields('name');
        return false;
      }

      if ((date === '') && (exp === '')) {
        this.highlightFields('date');
        return false;
      } else {
        return true;
      }
    },
    highlightFields: function(field) {
      switch (field) {
        case 'name':
          $('#i-name, .photo').css('box-shadow', '0px 0px 10px 5px #F2AF00');
          $('span.msg').html("Please provide <i>a photo</i> or <i>a name</i>!");
          break;
        case 'date':
          $('#i-date, #i-exp').closest('div').css('box-shadow', '0px 0px 10px 5px #F2AF00');
          $('span.msg').html("Please enter <i>added date</i> or <i>expiration date</i>!");
          break;
        default:
          break;
      }
    },
    unhighlightFields: function() {
      $('#i-name, .photo').css('box-shadow', 'none');
      $('#i-date, #i-exp').closest('div').css('box-shadow', 'none');
      $('.msg').hide();
    },
    cancelOverlay: function() {
      this.setView('listView');
      this.resetInputFields();
    },
    resetInputFields: function() {
      $('div.photo').css('background-image', 'url("../img/add-photo.svg")')
      .css('background-size', 'inherit');
      $('input[name="i-name"]').val('');
      $('input[name="i-quantity"]').val('');
      $('input[name="i-date"]').val('');
      $('input[name="i-exp"]').val('');
      this.unhighlightFields();
      this.UI.photo = '';
    },
    showPanel: function() {
      // console.log('showPanel (start)', 'slideOpen:', this.UI.slideOpen);

      var _this = this;
      $('.todo-panel').stop().animate({
        left: "0vw"
      }, 300).promise().done(function() {
        _this.UI.slideOpen = true;
        // console.log('showPanel (end)', 'slideOpen:', _this.UI.slideOpen);
      });
    },
    hidePanel: function() {
      // console.log('hidePanel (start)', 'slideOpen:', this.UI.slideOpen);

      var _this = this;
      $('.todo-panel').stop().animate({
        left: "-92vw"
      }, 300).promise().done(function() {
        _this.UI.slideOpen = false;
        // console.log('hidePanel (end)', 'slideOpen:', _this.UI.slideOpen);
      });
    },
    openTodo: function() {
      // console.log('openTodo() start', 'slideOpen:', this.UI.slideOpen);
      if (this.UI.slideOpen) {
        // console.log('if-statement for hiding:', 'slideOpen:', this.UI.slideOpen);
        this.hidePanel();
        $('body').removeClass('noscroll');
      } else {
        // console.log('if-statement for showing:', 'slideOpen:', this.UI.slideOpen);
        this.showPanel();
        $('body').addClass('noscroll');
      }
    }
  };

  var TodoApp = {
    init: function() {
      this.bindEvents();
    },
    bindEvents: function() {
      $('input.new-todo').on('keydown', this.checkForEnter.bind(this));

      $('.todo-list').on('touch click', 'li .view .toggle', this.toggleTodo.bind(this));
      $('.todo-list').on('touch click', 'li .view .destroy', this.removeTodo.bind(this));
      $('.main-list').on('touch click', '.toggle-all', this.toggleAll.bind(this));
      $('footer.shoplist .clear-completed').on('touch click', this.clearCompleted.bind(this));
      USER.list.on('value', this.render.bind(this));

    },
    render: function(response) {
      var responseVal = response.val();
      var rIds = _.keys(responseVal);
      var todos = _.map(rIds, function(id){
        var todoObj = responseVal[id];
        return {
          id: id,
          content: todoObj.content,
          completed: todoObj.completed
        };
      });
      var todoHtml = '';
      todos.forEach(function(todo) {
        var htmlString = Utils.todoMarkup(todo.id, todo.content, todo.completed);
        todoHtml += htmlString;
      });
      $('.todo-list').html(todoHtml);
      this.checkIfEmpty(todos.length);
      this.displayNumberOfItems(todos);
    },
    checkIfEmpty: function(todoLength) {
      if (todoLength === 0) {
        $('.main-list').hide();
        $('footer.shoplist').hide();
      } else {
        $('.main-list').show();
        $('footer.shoplist').show();
      } // If there's no todos, hide .main and .footer; otherwise, display both
    },
    checkForEnter: function(e) {
      if (e.which === 13) {
        var enteredValue = $('.new-todo').val().trim();
        $('.new-todo').val("");

        if (enteredValue !== "") {
          this.createToDo(enteredValue);
        }
      }
    },
    createToDo: function(todo) {
        var newTodo = {
          completed: false,
          content: todo
        };
        USER.list.push(newTodo);
    },
    toggleTodo: function(e) {
      var todoId = $(e.target).parents('li').attr('data-id');
      USER.list.child(todoId).once('value').then(function(snapshot) {
        var todoItem = snapshot.val();
        var toggleVal = !todoItem.completed;
        USER.list.child(todoId).update({
          completed: toggleVal
        });
      });
      $(e.target).parents('li').toggleClass('completed'); // toggle the CSS class of the clicked item
    },
    toggleAll: function(e) {
      var _this = this;
      USER.list.once('value').then(function(snapshot){
        var responseVal = snapshot.val();
        var rIds = _.keys(responseVal);
        var todos = _.map(rIds, function(id){
          var todoObj = responseVal[id];
          return {
            id: id,
            content: todoObj.content,
            completed: todoObj.completed
          };
        });

        var toggleCase = (Utils.allTodoComplete(todos)) ? false : true;
        _this.toggleVal(todos, toggleCase);
      });
    },
    toggleVal: function(todos, toggleCase) {
      var bool = toggleCase;
      todos.forEach(function(todo){
        USER.list.child(todo.id).update({ completed: bool });
      });

      switch (bool) {
        case true:
          $('.todo-list li').addClass('completed');
          $('.todo-list li .view input:checkbox').prop('checked',true);
          $('footer.shoplist .clear-completed').show();
          break;
        case false:
          $('.todo-list li').removeClass('completed');
          $('.todo-list li .view input:checkbox').prop('checked',false);
          $('footer.shoplist .clear-completed').hide();
          break;
      }
    },
    clearCompleted: function() {
      USER.list.once('value').then(function(snapshot){
        var responseVal = snapshot.val();
        var rIds = _.keys(responseVal);
        var todos = _.map(rIds, function(id){
          var todoObj = responseVal[id];
          return {
            id: id,
            content: todoObj.content,
            completed: todoObj.completed
          };
        });

        todos.forEach(function(todo){
          var id = todo.id;
          if (todo.completed) {
            USER.list.child(id).remove();
          }
        });
      });
    },
    removeTodo: function(e) {
      var todoId = $(e.target).parents('li').attr('data-id'); // retrieve the data-id attribute of clicked item
      USER.list.child(todoId).remove();
      $(e.target).parents('li').remove(); // remove the list item from DOM
    },
    getTotalNumber: function(todos) {
      var activeItems = 0;
      todos.forEach(function(todo){
        if (todo.completed === false) {
          activeItems++;
        }
      });
      return activeItems;
    },
    displayNumberOfItems: function(todos) {
      var totalItems = this.getTotalNumber(todos);
      var clearCompleted = $('footer.shoplist .clear-completed');

      $('.list-count').html('<strong>' + totalItems + '</strong> item' + ((totalItems === 1)?' left':'s left'));

      if (Utils.someTodoComplete(todos)) {
        $(clearCompleted).show();
      } else {
        $(clearCompleted).hide();
      }
      $('.toggle-all').prop('checked', (Utils.allTodoComplete(todos) ? true : false));
    }
  };
});
